'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { escapeHtml } from '@/utils/html'
import { inquiryBuyerCapabilityLifetimeMs, verifyInquiryBuyerCapability } from '@/utils/inquiry-buyer-capability.mjs'
import { parseBuyerInquiryResponse } from '@/utils/inquiry-safety.mjs'
import { siteUrl } from '@/utils/site'

export type BuyerInquiryResponseState = { success: boolean; message: string }

const credentials = (formData: FormData) => {
  const id = formData.get('id')
  const eventId = formData.get('event_id')
  const token = formData.get('token')
  return {
    id: typeof id === 'string' ? id.trim() : '',
    eventId: typeof eventId === 'string' ? eventId.trim() : '',
    token: typeof token === 'string' ? token.trim() : '',
  }
}

export async function submitBuyerInquiryResponse(_state: BuyerInquiryResponseState, formData: FormData): Promise<BuyerInquiryResponseState> {
  const { id, eventId, token } = credentials(formData)
  const admin = await createAdminClient()
  const [{ data: inquiry, error: inquiryError }, { data: targetEvent, error: eventError }] = await Promise.all([
    admin.from('marketplace_inquiries').select('id,listing_id,buyer_name,buyer_email,currency,status').eq('id', id).maybeSingle(),
    admin.from('marketplace_inquiry_offer_events').select('id,inquiry_id,event_type,created_at').eq('id', eventId).eq('inquiry_id', id).maybeSingle(),
  ])
  if (inquiryError || eventError || !inquiry || !targetEvent) return { success: false, message: 'This negotiation link is invalid or no longer available.' }
  const expiresAt = new Date(new Date(targetEvent.created_at).getTime() + inquiryBuyerCapabilityLifetimeMs)
  const authorized = verifyInquiryBuyerCapability({
    inquiryId: inquiry.id,
    eventId: targetEvent.id,
    buyerEmail: inquiry.buyer_email,
    expiresAt,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
    token,
  })
  if (!authorized) return { success: false, message: 'This negotiation link is invalid or has expired.' }

  let response
  try {
    response = parseBuyerInquiryResponse(formData)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Please review your response.' }
  }

  const { data: transition, error: transitionError } = await admin.rpc('record_buyer_inquiry_response', {
    p_inquiry_id: inquiry.id,
    p_responding_to_event_id: targetEvent.id,
    p_buyer_email: inquiry.buyer_email,
    p_response: response.response,
    p_amount_minor: response.amount_minor,
    p_note: response.note,
  })
  const result = Array.isArray(transition) ? transition[0] : transition
  if (transitionError || !result?.event_id || !result?.inquiry_status) {
    return { success: false, message: transitionError?.message || 'AeroTrade could not safely record this response.' }
  }

  const [{ data: event, error: responseReadbackError }, { data: storedInquiry, error: inquiryReadbackError }, { data: listing, error: listingError }] = await Promise.all([
    admin.from('marketplace_inquiry_offer_events').select('id,event_type,amount_minor,currency,note,seller_notification_status,responding_to_event_id').eq('id', result.event_id).eq('inquiry_id', inquiry.id).single(),
    admin.from('marketplace_inquiries').select('id,status,last_activity_at,closed_at').eq('id', inquiry.id).single(),
    admin.from('listings').select('id,title,contact_email').eq('id', inquiry.listing_id).single(),
  ])
  if (responseReadbackError || inquiryReadbackError || listingError || !event?.id || !listing?.id
    || event.responding_to_event_id !== targetEvent.id || storedInquiry?.status !== result.inquiry_status) {
    return { success: false, message: 'Your response was processed, but AeroTrade could not verify its complete state.' }
  }

  if (event.seller_notification_status !== 'accepted') {
    const amount = event.amount_minor === null
      ? null
      : (Number(event.amount_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: event.currency })
    const responseLabel = event.event_type === 'BUYER_COUNTERED'
      ? `The buyer proposed ${amount}`
      : event.event_type === 'BUYER_DECLINED'
        ? 'The buyer declined this negotiation'
        : 'The buyer wants to continue negotiating'
    let notificationStatus: 'accepted' | 'failed' = 'failed'
    let providerMessageId: string | null = null
    try {
      const delivery = await sendCommercialReceiptEmail(admin, {
        notificationType: 'inquiry_seller_buyer_response',
        entityType: 'inquiry',
        entityId: inquiry.id,
        recipientRole: 'seller',
        to: listing.contact_email,
        subject: `AeroTrade buyer response: ${listing.title}`,
        html: `<h2>${escapeHtml(responseLabel)}</h2>
        <p><strong>Listing:</strong> ${escapeHtml(listing.title)}</p>
        <p><strong>Buyer:</strong> ${escapeHtml(inquiry.buyer_name)}</p>
        ${event.note ? `<p><strong>Buyer note:</strong><br />${escapeHtml(event.note).replaceAll('\n', '<br />')}</p>` : ''}
        <p>This is a non-binding negotiation response. It does not reserve equipment, execute payment or form a sale contract.</p>
        <p><a href="${escapeHtml(`${siteUrl}/dashboard`)}">Open the enquiry in your AeroTrade dashboard</a></p>`,
        idempotencyKey: `inquiry-seller-buyer-response-${event.id}`,
      })
      notificationStatus = delivery.success ? 'accepted' : 'failed'
      providerMessageId = delivery.providerMessageId
    } catch (error) {
      console.error('Buyer response was stored but the seller notification failed:', error)
    }

    const { data: notificationReadback, error: notificationError } = await admin
      .from('marketplace_inquiry_offer_events')
      .update({
        seller_notification_status: notificationStatus,
        seller_notification_provider_id: providerMessageId,
        seller_notification_error: notificationStatus === 'accepted' ? null : 'Provider acceptance was not confirmed.',
      })
      .eq('id', event.id)
      .select('seller_notification_status,seller_notification_provider_id')
      .single()
    if (notificationError || notificationReadback?.seller_notification_status !== notificationStatus) {
      return { success: true, message: 'Your response is safely recorded. Its seller notification needs an internal review.' }
    }
    if (notificationStatus === 'failed') {
      return { success: true, message: 'Your response is safely recorded and visible to the seller in AeroTrade. Email delivery will be reviewed.' }
    }
  }

  return { success: true, message: 'Your response is safely recorded and the seller has been notified.' }
}
