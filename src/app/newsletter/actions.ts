'use server'

import { headers } from 'next/headers'
import { createAdminClient } from '@/utils/supabase/server'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { siteUrl } from '@/utils/site'
import {
  parsePublicNewsletterOptIn,
  publicNewsletterEmailHash,
  publicNewsletterSubmissionKey,
} from '@/utils/newsletter-public-subscription.mjs'
import { buildPublicNewsletterConfirmation } from '@/utils/newsletter-public-confirmation.mjs'
import { commercialJourneyKey, normalizeCommercialContext } from '@/utils/commercial-attribution.mjs'

export type PublicNewsletterRequestState = { success: boolean; message: string }

const genericSuccess = 'Check your inbox. If this address is eligible, AeroTrade has sent a confirmation link. Nothing is subscribed until you confirm it.'

export async function requestPublicNewsletterOptIn(
  _state: PublicNewsletterRequestState,
  formData: FormData,
): Promise<PublicNewsletterRequestState> {
  let request
  try {
    request = parsePublicNewsletterOptIn(formData)
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unable to request marketplace updates.' }
  }

  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  const attribution = normalizeCommercialContext({
    visitorId: formData.get('attribution_visitor_id'),
    referrer: formData.get('attribution_referrer'),
    utmSource: formData.get('attribution_utm_source'),
    utmMedium: formData.get('attribution_utm_medium'),
    utmCampaign: formData.get('attribution_utm_campaign'),
  })
  const requestHeaders = await headers()
  const clientAddress = requestHeaders.get('x-nf-client-connection-ip')
    || requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
    || ''
  const emailHash = publicNewsletterEmailHash(request.email, secret)
  const submissionKey = publicNewsletterSubmissionKey(clientAddress, requestHeaders.get('user-agent'), secret)
  if (!emailHash || !submissionKey) {
    return { success: false, message: 'AeroTrade could not safely process this request. Please try again.' }
  }

  const admin = await createAdminClient()
  const { data, error } = await admin.rpc('begin_public_newsletter_optin', {
    p_email: request.email,
    p_email_hash: emailHash,
    p_request_key: submissionKey,
    p_source_context: request.source_context,
    p_journey_key: commercialJourneyKey({ principal: attribution.visitorId, secret }),
    p_referrer_host: attribution.referrer_host,
    p_utm_source: attribution.utm_source,
    p_utm_medium: attribution.utm_medium,
    p_utm_campaign: attribution.utm_campaign,
  })
  const claim = Array.isArray(data) ? data[0] : data
  if (error || !claim?.subscription_id) {
    console.error('Public newsletter request could not be claimed:', error)
    return { success: false, message: error?.code === 'P0001' ? 'Too many requests were received. Please try again later.' : 'AeroTrade could not safely process this request. Please try again.' }
  }
  if (!claim.should_send) return { success: true, message: genericSuccess }

  const confirmation = buildPublicNewsletterConfirmation({
    subscriptionId: claim.subscription_id,
    email: claim.normalized_email,
    confirmationCycle: claim.confirmation_cycle,
    secret,
    baseUrl: siteUrl,
  })
  if (!confirmation) {
    console.error('Public newsletter confirmation capability could not be generated.')
    return { success: false, message: 'AeroTrade could not safely process this request. Please try again.' }
  }
  try {
    const delivery = await sendCommercialReceiptEmail(admin, {
      notificationType: 'newsletter_public_optin_confirmation',
      entityType: 'newsletter_subscription',
      entityId: claim.subscription_id,
      recipientRole: 'buyer',
      to: claim.normalized_email,
      subject: confirmation.subject,
      html: confirmation.html,
      idempotencyKey: confirmation.idempotencyKey,
    })
    if (!delivery.success || !delivery.providerMessageId) {
      console.error('Public newsletter confirmation delivery was not accepted:', delivery.reason)
    }
  } catch (deliveryError) {
    console.error('Public newsletter confirmation delivery failed safely:', deliveryError)
  }

  return { success: true, message: genericSuccess }
}
