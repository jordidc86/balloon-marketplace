'use server'

import { headers } from 'next/headers'
import { createAdminClient, createClient } from '@/utils/supabase/server'
import { commercialJourneyKey, normalizeCommercialContext } from '@/utils/commercial-attribution.mjs'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { escapeHtml } from '@/utils/html'
import { createSellerAssistanceSubmissionKey, parseSellerAssistanceRequest } from '@/utils/seller-assistance.mjs'
import { siteUrl } from '@/utils/site'
import type { BrowserCommercialContext } from '@/utils/browser-attribution'

export async function submitSellerAssistanceRequest(formData: FormData, rawContext?: BrowserCommercialContext) {
  let request
  try {
    request = parseSellerAssistanceRequest(formData)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to submit this request.' }
  }

  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  const supabase = await createAdminClient()
  const attribution = normalizeCommercialContext(rawContext)
  const requestHeaders = await headers()
  const clientAddress = requestHeaders.get('x-nf-client-connection-ip')
    || requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    || ''
  const submissionKey = createSellerAssistanceSubmissionKey(
    clientAddress,
    requestHeaders.get('user-agent'),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
  if (!submissionKey) return { success: false, message: 'We could not safely record this request. Please try again.' }

  const duplicateCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: duplicate, error: duplicateError } = await supabase
    .from('seller_assistance_requests')
    .select('id')
    .eq('email', request.email)
    .eq('category', request.category)
    .gte('created_at', duplicateCutoff)
    .not('status', 'in', '(CLOSED,SPAM)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (duplicateError) return { success: false, message: 'We could not safely check this request. Please try again.' }
  if (duplicate?.id) return { success: true, duplicate: true, message: 'Your assisted-sale request is already safely recorded.' }

  const rateCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: rateError } = await supabase
    .from('seller_assistance_requests')
    .select('id', { count: 'exact', head: true })
    .eq('submission_key', submissionKey)
    .gte('created_at', rateCutoff)
  if (rateError) return { success: false, message: 'We could not safely check this request. Please try again.' }
  if ((count || 0) >= 5) return { success: false, message: 'Too many requests were received. Please try again later.' }

  const now = new Date().toISOString()
  const { data: stored, error: insertError } = await supabase
    .from('seller_assistance_requests')
    .insert({
      seller_user_id: user?.id || null,
      ...request,
      privacy_consent_at: now,
      submission_key: submissionKey,
      journey_key: commercialJourneyKey({ principal: user?.id || attribution.visitorId, secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
      referrer_host: attribution.referrer_host,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      last_activity_at: now,
      status: 'NEW',
    })
    .select('id,status')
    .single()
  if (insertError || !stored?.id || stored.status !== 'NEW') {
    console.error('Could not store seller assistance request:', insertError)
    return { success: false, message: 'We could not save your request. Please try again.' }
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim()
  if (adminEmail) {
    const price = request.expected_price_minor === null
      ? 'Not specified'
      : (request.expected_price_minor / 100).toLocaleString('en-IE', { style: 'currency', currency: request.currency })
    try {
      await sendCommercialReceiptEmail(supabase, {
        notificationType: 'seller_assistance_created_admin',
        entityType: 'seller_assistance',
        entityId: stored.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: `AeroTrade assisted-sale request: ${request.category}`,
        html: `<h2>New assisted-sale opportunity</h2>
        <p><strong>Seller:</strong> ${escapeHtml(request.name)}</p>
        <p><strong>Email:</strong> <a href="mailto:${escapeHtml(request.email)}">${escapeHtml(request.email)}</a></p>
        <p><strong>Equipment:</strong> ${escapeHtml([request.manufacturer, request.model].filter(Boolean).join(' ') || request.category)}</p>
        <p><strong>Expected price:</strong> ${escapeHtml(price)}</p>
        <p><strong>Documentation:</strong> ${escapeHtml(request.documentation_readiness)} · <strong>Photos:</strong> ${escapeHtml(request.photo_readiness)}</p>
        <p><a href="${escapeHtml(`${siteUrl}/admin/commercial`)}">Open the existing AeroTrade commercial pipeline</a>.</p>`,
        idempotencyKey: `seller-assistance-created-${stored.id}`,
      })
    } catch (notificationError) {
      console.error(`Seller assistance ${stored.id} was stored but its admin notification needs review:`, notificationError)
    }
  }

  return { success: true, message: 'Your request is safely recorded. AeroTrade will review the equipment and help you prepare the normal marketplace listing.' }
}

