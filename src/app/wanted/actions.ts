'use server'

import { createAdminClient, createClient } from '@/utils/supabase/server'
import { createWantedSubmissionKey, parseWantedRequest } from '@/utils/wanted-request.mjs'
import { sendEmail } from '@/utils/resend'
import { escapeHtml } from '@/utils/html'
import { siteUrl } from '@/utils/site'
import { headers } from 'next/headers'
import { commercialJourneyKey, normalizeCommercialContext } from '@/utils/commercial-attribution.mjs'
import type { BrowserCommercialContext } from '@/utils/browser-attribution'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { buildWantedBuyerAcknowledgement } from '@/utils/wanted-buyer-acknowledgement.mjs'

const adminEmail = process.env.ADMIN_EMAIL?.trim()

export async function submitWantedRequest(formData: FormData, rawContext?: BrowserCommercialContext) {
  let request
  try {
    request = parseWantedRequest(formData)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to submit this request' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const supabaseAdmin = await createAdminClient()
  const attribution = normalizeCommercialContext(rawContext)
  const requestHeaders = await headers()
  const clientAddress = requestHeaders.get('x-nf-client-connection-ip')
    || requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    || ''
  const submissionKey = createWantedSubmissionKey(
    clientAddress,
    requestHeaders.get('user-agent'),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
  const duplicateCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: duplicate, error: duplicateError } = await supabaseAdmin
    .from('wanted_requests')
    .select('id')
    .eq('buyer_email', request.buyer_email)
    .eq('category', request.category)
    .gte('created_at', duplicateCutoff)
    .neq('status', 'SPAM')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (duplicateError) {
    console.error('Could not check wanted-request duplication:', duplicateError)
    return { success: false, message: 'We could not safely record this request. Please try again.' }
  }
  if (duplicate?.id) {
    return { success: true, duplicate: true, message: 'Your equipment request is already safely recorded in AeroTrade.' }
  }

  if (submissionKey) {
    const rateCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count, error: rateError } = await supabaseAdmin
      .from('wanted_requests')
      .select('id', { count: 'exact', head: true })
      .eq('submission_key', submissionKey)
      .gte('created_at', rateCutoff)
    if (rateError) {
      console.error('Could not verify wanted-request rate limit:', rateError)
      return { success: false, message: 'We could not safely record this request. Please try again.' }
    }
    if ((count || 0) >= 5) return { success: false, message: 'Too many requests were received. Please try again later.' }
  }

  const { data: stored, error: insertError } = await supabaseAdmin
    .from('wanted_requests')
    .insert({
      buyer_user_id: user?.id || null,
      ...request,
      privacy_consent_at: new Date().toISOString(),
      source: 'wanted_form',
      submission_key: submissionKey,
      referrer_host: attribution.referrer_host,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      journey_key: commercialJourneyKey({ principal: user?.id || attribution.visitorId, secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
      status: 'NEW',
    })
    .select('id,status')
    .single()

  if (insertError || !stored?.id || stored.status !== 'NEW') {
    console.error('Could not store wanted request:', insertError)
    return { success: false, message: 'We could not save your request. Please try again.' }
  }

  let matchQuery = supabaseAdmin
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .or(`status.eq.ACTIVE_PUBLIC,and(status.eq.ACTIVE_PREMIUM,public_at.lte.${new Date().toISOString()})`)
    .eq('category', request.category)
    .eq('currency', request.currency)
  if (request.budget_max_minor !== null) matchQuery = matchQuery.lte('price', request.budget_max_minor / 100)
  const { count: matchingCount } = await matchQuery

  const notificationKey = `aerotrade-wanted-${stored.id}-admin`
  const { data: receipt, error: receiptError } = await supabaseAdmin
    .from('commercial_notification_receipts')
    .upsert({
      notification_type: 'wanted_request_admin',
      entity_type: 'wanted_request',
      entity_id: stored.id,
      recipient_role: 'admin',
      status: 'pending',
      idempotency_key: notificationKey,
    }, { onConflict: 'idempotency_key' })
    .select('id')
    .single()

  if (receiptError || !receipt?.id) {
    console.error(`Wanted request ${stored.id} was stored but its notification receipt could not be created`)
  } else {
    const budget = request.budget_min_minor === null && request.budget_max_minor === null
      ? 'Not specified'
      : `${request.budget_min_minor === null ? '0' : (request.budget_min_minor / 100).toLocaleString('en-IE')}–${request.budget_max_minor === null ? 'open' : (request.budget_max_minor / 100).toLocaleString('en-IE')} ${request.currency}`
    const delivery = adminEmail ? await sendEmail(
      adminEmail,
      `AeroTrade buyer demand: ${request.category}`,
      `<h2>New tracked buyer demand</h2>
      <p><strong>Name:</strong> ${escapeHtml(request.buyer_name)}</p>
      <p><strong>Email:</strong> <a href="mailto:${escapeHtml(request.buyer_email)}">${escapeHtml(request.buyer_email)}</a></p>
      ${request.buyer_phone ? `<p><strong>Phone:</strong> ${escapeHtml(request.buyer_phone)}</p>` : ''}
      <p><strong>Category:</strong> ${escapeHtml(request.category)}</p>
      <p><strong>Location preference:</strong> ${escapeHtml(request.location_preference || 'Not specified')}</p>
      <p><strong>Budget:</strong> ${escapeHtml(budget)}</p>
      <p><strong>Notify on match:</strong> ${request.notify_on_match ? 'Yes' : 'No'}</p>
      <p><strong>Current catalog candidates:</strong> ${matchingCount || 0}</p>
      <p>${escapeHtml(request.details).replaceAll('\n', '<br />')}</p>
      <p><a href="${escapeHtml(`${siteUrl}/admin/commercial`)}">Review in AeroTrade Commercial Pipeline</a></p>`,
      { idempotencyKey: notificationKey },
    ) : { success: false, resendId: undefined }

    const accepted = delivery.success && delivery.resendId
    const expectedStatus = accepted ? 'accepted' : 'failed'
    const now = new Date().toISOString()
    const { data: notificationReadback, error: notificationError } = await supabaseAdmin
      .from('commercial_notification_receipts')
      .update({
        status: expectedStatus,
        provider_message_id: accepted ? delivery.resendId : null,
        error_message: accepted ? null : adminEmail ? 'Provider acceptance was not confirmed.' : 'ADMIN_EMAIL is not configured.',
        attempted_at: now,
        accepted_at: accepted ? now : null,
      })
      .eq('id', receipt.id)
      .select('id,status')
      .single()
    if (notificationError || notificationReadback?.status !== expectedStatus) {
      console.error(`Wanted request ${stored.id} notification result could not be verified`)
    }
  }

  try {
    const acknowledgement = buildWantedBuyerAcknowledgement({
      category: request.category,
      notifyOnMatch: request.notify_on_match,
      matchingCount: matchingCount || 0,
    }, siteUrl)
    await sendCommercialReceiptEmail(supabaseAdmin, {
      notificationType: 'wanted_buyer_ack',
      entityType: 'wanted_request',
      entityId: stored.id,
      recipientRole: 'buyer',
      to: request.buyer_email,
      subject: acknowledgement.subject,
      html: acknowledgement.html,
      idempotencyKey: `wanted-buyer-ack-${stored.id}`,
    })
  } catch (error) {
    console.error(`Wanted request ${stored.id} buyer acknowledgement could not be completed:`, error)
  }

  return {
    success: true,
    message: request.notify_on_match
      ? `Your request is recorded. AeroTrade may email you when suitable equipment is identified. ${matchingCount || 0} current catalog candidate(s) meet the basic category, currency and budget filters.`
      : `Your request is recorded for manual review. ${matchingCount || 0} current catalog candidate(s) meet the basic category, currency and budget filters.`,
  }
}
