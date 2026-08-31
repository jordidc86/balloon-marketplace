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
