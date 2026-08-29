'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { newBalloonQuoteSubmissionKey, parseNewBalloonQuoteRequest } from '@/utils/new-balloon-request.mjs'
import { commercialJourneyKey, normalizeCommercialContext } from '@/utils/commercial-attribution.mjs'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { siteUrl } from '@/utils/site'
import { buildNewBalloonBuyerAcknowledgement } from '@/utils/new-balloon-buyer-acknowledgement.mjs'

const adminEmail = process.env.ADMIN_EMAIL?.trim()

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export async function submitNewBalloonQuote(formData: FormData) {
  let request
  try {
    request = parseNewBalloonQuoteRequest(formData)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit this request.'
    redirect('/new-balloon?error=' + encodeURIComponent(message))
  }

  const requestHeaders = await headers()
  const attribution = normalizeCommercialContext({
    visitorId: formData.get('attribution_visitor_id'),
    referrer: formData.get('attribution_referrer'),
    utmSource: formData.get('attribution_utm_source'),
    utmMedium: formData.get('attribution_utm_medium'),
    utmCampaign: formData.get('attribution_utm_campaign'),
  })
  const clientAddress = requestHeaders.get('x-nf-client-connection-ip')
    || requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    || ''
  const submissionKey = newBalloonQuoteSubmissionKey(
    clientAddress,
    requestHeaders.get('user-agent'),
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
  if (!submissionKey) {
    redirect('/new-balloon?error=' + encodeURIComponent('We could not safely record your request. Please try again.'))
  }

  const storageResult = await (async () => {
    try {
      const supabase = await createAdminClient()
      const duplicateCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: duplicate, error: duplicateError } = await supabase
        .from('quote_requests')
        .select('id')
        .eq('email', request.email)
        .eq('equipment_type', request.equipment_type)
        .gte('created_at', duplicateCutoff)
        .not('status', 'in', '(WON,LOST)')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (duplicateError) throw duplicateError
      if (duplicate?.id) return { kind: 'duplicate' as const }

      const rateCutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count, error: rateError } = await supabase
        .from('quote_requests')
        .select('id', { count: 'exact', head: true })
        .eq('submission_key', submissionKey)
        .gte('created_at', rateCutoff)
      if (rateError) throw rateError
      if ((count || 0) >= 5) return { kind: 'rate_limited' as const }

      const { data, error } = await supabase
        .from('quote_requests')
        .insert({
          ...request,
          journey_key: commercialJourneyKey({ principal: attribution.visitorId, secret: process.env.SUPABASE_SERVICE_ROLE_KEY }),
          referrer_host: attribution.referrer_host,
          utm_source: attribution.utm_source,
          utm_medium: attribution.utm_medium,
          utm_campaign: attribution.utm_campaign,
          privacy_consent_at: new Date().toISOString(),
          submission_key: submissionKey,
          status: 'NEW',
        })
        .select('id')
        .single()

      if (error || !data?.id) {
        throw new Error(error?.message || 'Quote request readback did not return an id')
      }
      return { kind: 'stored' as const, requestId: String(data.id), supabase }
    } catch (error) {
      console.error('Quote request storage is not available:', error)
      return { kind: 'failed' as const }
    }
  })()

  if (storageResult.kind === 'duplicate') redirect('/new-balloon?success=true&duplicate=true')
  if (storageResult.kind === 'rate_limited') {
    redirect('/new-balloon?error=' + encodeURIComponent('Too many requests were received. Please try again later.'))
  }
  if (storageResult.kind === 'failed') {
    redirect('/new-balloon?error=' + encodeURIComponent('We could not save your request. Please try again.'))
  }
  const { requestId, supabase } = storageResult

  const rows = Object.entries(request)
    .map(([key, value]) => `
      <tr>
        <td style="padding: 8px 12px; color: #64748b; text-transform: capitalize;">${escapeHtml(key.replaceAll('_', ' '))}</td>
        <td style="padding: 8px 12px; color: #0f172a; font-weight: 600;">${escapeHtml(String(value || '-'))}</td>
      </tr>
    `)
    .join('')

  if (adminEmail) {
    try {
      await sendCommercialReceiptEmail(supabase, {
        notificationType: 'quote_created_admin',
        entityType: 'quote_request',
        entityId: requestId,
        recipientRole: 'admin',
        to: adminEmail,
        subject: `New Pasha/Schroeder balloon quote request: ${request.name}`,
        html: `<h2>New AeroTrade balloon quote request</h2>
          <p>A buyer is asking for a fast price indication and first visual concept for a new Pasha or Schroeder balloon.</p>
          <table style="border-collapse: collapse; width: 100%; max-width: 720px;">${rows}</table>`,
        idempotencyKey: `aerotrade-quote-${requestId}`,
      })
    } catch (error) {
      console.error(`Quote request ${requestId} was stored but its admin notification could not be completed`, error)
    }
  } else {
    console.error(`Quote request ${requestId} was stored but ADMIN_EMAIL is not configured`)
  }

  try {
    const acknowledgement = buildNewBalloonBuyerAcknowledgement(request, siteUrl)
    await sendCommercialReceiptEmail(supabase, {
      notificationType: 'new_balloon_buyer_ack',
      entityType: 'quote_request',
      entityId: requestId,
      recipientRole: 'buyer',
      to: request.email,
      subject: acknowledgement.subject,
      html: acknowledgement.html,
      idempotencyKey: `new-balloon-buyer-ack-${requestId}`,
    })
  } catch (error) {
    console.error(`Quote request ${requestId} was stored but its buyer acknowledgement could not be completed`, error)
  }

  redirect('/new-balloon?success=true')
}
