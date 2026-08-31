'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { newBalloonProposalResponseExpiry, verifyNewBalloonProposalCapability } from '@/utils/new-balloon-proposal-capability.mjs'
import { buildNewBalloonProposalResponseAdminNotification } from '@/utils/new-balloon-proposal-notifications.mjs'
import { newBalloonProposalResponseLabel, parseNewBalloonProposalResponse } from '@/utils/new-balloon-proposal-response.mjs'
import { siteUrl } from '@/utils/site'

export type NewBalloonProposalResponseState = { success: boolean; message: string }

const credentials = (formData: FormData) => {
  const proposalId = formData.get('proposal_id')
  const token = formData.get('token')
  return {
    proposalId: typeof proposalId === 'string' ? proposalId.trim() : '',
    token: typeof token === 'string' ? token.trim() : '',
  }
}

export async function submitNewBalloonProposalResponse(_state: NewBalloonProposalResponseState, formData: FormData): Promise<NewBalloonProposalResponseState> {
  const { proposalId, token } = credentials(formData)
  const admin = await createAdminClient()
  const { data: proposal, error: proposalError } = await admin
    .from('new_balloon_quote_proposals')
    .select('id,quote_request_id,manufacturer,valid_until,delivery_status')
    .eq('id', proposalId)
    .maybeSingle()
  if (proposalError || !proposal) return { success: false, message: 'This proposal link is invalid or no longer available.' }
  const { data: quote, error: quoteError } = await admin
    .from('quote_requests')
    .select('id,name,email,status')
    .eq('id', proposal.quote_request_id)
    .maybeSingle()
  const expiresAt = newBalloonProposalResponseExpiry(proposal.valid_until)
  const authorized = Boolean(quote && expiresAt && proposal.delivery_status === 'accepted' && !['WON', 'LOST'].includes(quote.status)
    && verifyNewBalloonProposalCapability({
      proposalId: proposal.id,
      quoteRequestId: proposal.quote_request_id,
      buyerEmail: quote.email,
      expiresAt,
      secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
      token,
    }))
  if (quoteError || !authorized || !quote) return { success: false, message: 'This proposal link is invalid or has expired.' }

  let response
  try {
    response = parseNewBalloonProposalResponse(formData)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Please review your response.' }
  }

  const { data: transition, error: transitionError } = await admin.rpc('record_new_balloon_proposal_response', {
    p_proposal_id: proposal.id,
    p_buyer_email: quote.email,
    p_response_type: response.response_type,
    p_note: response.note,
  })
  const result = Array.isArray(transition) ? transition[0] : transition
  if (transitionError || !result?.event_id || result.response_type !== response.response_type) {
    return { success: false, message: transitionError?.message || 'AeroTrade could not safely record this response.' }
  }

  const [{ data: event, error: readbackError }, { data: quoteReadback, error: quoteReadbackError }] = await Promise.all([
    admin
      .from('new_balloon_proposal_response_events')
      .select('id,proposal_id,quote_request_id,response_type,note,admin_notification_status')
      .eq('id', result.event_id)
      .eq('proposal_id', proposal.id)
      .single(),
    admin.from('quote_requests').select('id,status,updated_at').eq('id', quote.id).single(),
  ])
  if (readbackError || quoteReadbackError || !event?.id || event.quote_request_id !== quote.id || event.response_type !== response.response_type || (event.note || null) !== response.note || quoteReadback?.status !== 'BUYER_RESPONDED') {
    return { success: false, message: 'Your response was processed, but AeroTrade could not verify its complete state.' }
  }

  if (event.admin_notification_status !== 'accepted') {
    const adminEmail = process.env.ADMIN_EMAIL?.trim()
    let notificationStatus: 'accepted' | 'failed' = 'failed'
    let providerMessageId: string | null = null
    let notificationError: string | null = adminEmail ? 'Provider acceptance was not confirmed.' : 'ADMIN_EMAIL is not configured.'
    if (adminEmail) {
      try {
        const notification = buildNewBalloonProposalResponseAdminNotification({
          quote,
          proposal,
          event,
          responseLabel: newBalloonProposalResponseLabel(event.response_type),
          commercialPipelineUrl: `${siteUrl}/admin/commercial#quote-${quote.id}`,
        })
        const delivery = await sendCommercialReceiptEmail(admin, {
          notificationType: 'new_balloon_proposal_response_admin',
          entityType: 'quote_proposal',
          entityId: proposal.id,
          recipientRole: 'admin',
          to: adminEmail,
          subject: notification.subject,
          html: notification.html,
          idempotencyKey: `new-balloon-proposal-response-admin-${event.id}`,
        })
        notificationStatus = delivery.success ? 'accepted' : 'failed'
        providerMessageId = delivery.providerMessageId
        notificationError = delivery.success ? null : notificationError
      } catch (error) {
        console.error('New-balloon response was stored but its admin notification failed:', error)
      }
    }
    const { data: notificationReadback, error: notificationUpdateError } = await admin
      .from('new_balloon_proposal_response_events')
      .update({
        admin_notification_status: notificationStatus,
        admin_notification_provider_id: providerMessageId,
        admin_notification_error: notificationError,
      })
      .eq('id', event.id)
      .select('admin_notification_status,admin_notification_provider_id')
      .single()
    if (notificationUpdateError || notificationReadback?.admin_notification_status !== notificationStatus) {
      return { success: true, message: 'Your response is safely recorded. Its internal notification needs review.' }
    }
    if (notificationStatus === 'failed') {
      return { success: true, message: 'Your response is safely recorded. AeroTrade will review it even though the internal email needs attention.' }
    }
  }

  return { success: true, message: 'Your response is safely recorded and AeroTrade has been notified.' }
}
