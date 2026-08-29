'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { sendEmail } from '@/utils/resend'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { newBalloonQuoteSubmissionKey, parseNewBalloonQuoteRequest } from '@/utils/new-balloon-request.mjs'

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

  const notificationKey = `aerotrade-quote-${requestId}`
  const { data: receipt, error: receiptError } = await supabase
    .from('commercial_notification_receipts')
    .upsert({
      notification_type: 'quote_created_admin',
      entity_type: 'quote_request',
      entity_id: requestId,
      recipient_role: 'admin',
      status: 'pending',
      idempotency_key: notificationKey,
    }, { onConflict: 'idempotency_key' })
    .select('id')
    .single()

  if (receiptError || !receipt?.id) {
    console.error(`Quote request ${requestId} was stored but its notification receipt could not be created`)
    redirect('/new-balloon?success=true')
  }

  const delivery = adminEmail ? await sendEmail(
    adminEmail,
    `New Pasha/Schroeder balloon quote request: ${request.name}`,
    `
      <h2>New AeroTrade balloon quote request</h2>
      <p>A buyer is asking for a fast price indication and first visual concept for a new Pasha or Schroeder balloon.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 720px;">${rows}</table>
    `,
    { idempotencyKey: notificationKey },
  ) : { success: false, resendId: undefined }

  const accepted = delivery.success && delivery.resendId
  const expectedStatus = accepted ? 'accepted' : 'failed'
  const now = new Date().toISOString()
  const { data: notificationReadback, error: notificationError } = await supabase
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
    console.error(`Quote request ${requestId} was stored but its notification result could not be verified`)
  }

  redirect('/new-balloon?success=true')
}
