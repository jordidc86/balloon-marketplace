'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/server'
import { verifyNewsletterConsentInvitationCapability } from '@/utils/newsletter-consent.mjs'
import {
  publicNewsletterConfirmationIdempotencyKey,
  verifyPublicNewsletterConfirmation,
} from '@/utils/newsletter-public-subscription.mjs'

export type NewsletterConsentState = { success: boolean; message: string }

const value = (formData: FormData, name: string) => {
  const item = formData.get(name)
  return typeof item === 'string' ? item.trim() : ''
}

export async function confirmNewsletterConsent(
  _state: NewsletterConsentState,
  formData: FormData,
): Promise<NewsletterConsentState> {
  const userId = value(formData, 'id')
  const expiresAt = value(formData, 'expires')
  const token = value(formData, 'token')
  const admin = await createAdminClient()
  const [{ data: profile, error: profileError }, { data: receipt, error: receiptError }] = await Promise.all([
    admin
      .from('users')
      .select('id,email,role,newsletter_consent_status,newsletter_consented_at,newsletter_unsubscribed_at')
      .eq('id', userId)
      .maybeSingle(),
    admin
      .from('commercial_notification_receipts')
      .select('id,status,provider_message_id,idempotency_key')
      .eq('notification_type', 'newsletter_consent_invitation')
      .eq('entity_type', 'user')
      .eq('entity_id', userId)
      .eq('idempotency_key', `newsletter-consent-invitation-v1-${userId}`)
      .maybeSingle(),
  ])

  const authorized = Boolean(!profileError && !receiptError && profile?.id && profile.email && profile.role !== 'admin'
    && receipt?.status === 'accepted' && receipt.provider_message_id
    && verifyNewsletterConsentInvitationCapability({
      userId: profile.id,
      email: profile.email,
      expiresAt,
      token,
      secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }))
  if (!authorized || !profile) return { success: false, message: 'This preference invitation is invalid or has expired.' }

  if (profile.newsletter_consent_status === 'ACTIVE' && profile.newsletter_consented_at && !profile.newsletter_unsubscribed_at) {
    return { success: true, message: 'You are already subscribed to the bi-weekly AeroTrade marketplace update.' }
  }
  if (profile.newsletter_consent_status !== 'NOT_REQUESTED') {
    return { success: false, message: 'This invitation can no longer change your current preference.' }
  }

  const consentedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await admin
    .from('users')
    .update({
      newsletter_consent_status: 'ACTIVE',
      newsletter_consented_at: consentedAt,
      newsletter_unsubscribed_at: null,
    })
    .eq('id', profile.id)
    .eq('newsletter_consent_status', 'NOT_REQUESTED')
    .select('newsletter_consent_status,newsletter_consented_at,newsletter_unsubscribed_at')
    .single()
  if (updateError || updated?.newsletter_consent_status !== 'ACTIVE' || !updated.newsletter_consented_at || updated.newsletter_unsubscribed_at) {
    return { success: false, message: 'AeroTrade could not verify your newsletter preference safely.' }
  }

  revalidatePath('/dashboard')
  revalidatePath('/newsletter/subscribe')
  return { success: true, message: 'Confirmed. You will receive the optional bi-weekly AeroTrade marketplace update.' }
}

export async function confirmPublicNewsletterConsent(
  _state: NewsletterConsentState,
  formData: FormData,
): Promise<NewsletterConsentState> {
  const subscriptionId = value(formData, 'subscription')
  const confirmationCycle = Number(value(formData, 'cycle'))
  const expiresAt = value(formData, 'expires')
  const token = value(formData, 'token')
  const receiptKey = publicNewsletterConfirmationIdempotencyKey(subscriptionId, confirmationCycle)
  if (!receiptKey) return { success: false, message: 'This newsletter confirmation is invalid or has expired.' }

  const admin = await createAdminClient()
  const [{ data: subscription, error: subscriptionError }, { data: receipt, error: receiptError }] = await Promise.all([
    admin
      .from('newsletter_public_subscriptions')
      .select('id,email,status,confirmation_cycle,confirmed_at,unsubscribed_at')
      .eq('id', subscriptionId)
      .maybeSingle(),
    admin
      .from('commercial_notification_receipts')
      .select('status,provider_message_id,idempotency_key')
      .eq('notification_type', 'newsletter_public_optin_confirmation')
      .eq('entity_type', 'newsletter_subscription')
      .eq('entity_id', subscriptionId)
      .eq('idempotency_key', receiptKey)
      .maybeSingle(),
  ])
  const authorized = Boolean(!subscriptionError && !receiptError && subscription?.id && subscription.email
    && subscription.confirmation_cycle === confirmationCycle
    && receipt?.status === 'accepted' && receipt.provider_message_id
    && verifyPublicNewsletterConfirmation({
      subscriptionId,
      email: subscription.email,
      confirmationCycle,
      expiresAt,
      token,
      secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }))
  if (!authorized || !subscription) return { success: false, message: 'This newsletter confirmation is invalid or has expired.' }
  if (subscription.status === 'ACTIVE' && subscription.confirmed_at && !subscription.unsubscribed_at) {
    return { success: true, message: 'You are already subscribed to the bi-weekly AeroTrade marketplace update.' }
  }
  if (subscription.status !== 'PENDING') return { success: false, message: 'This confirmation can no longer change the current preference.' }

  const { data, error } = await admin.rpc('confirm_public_newsletter_optin', {
    p_subscription_id: subscriptionId,
    p_confirmation_cycle: confirmationCycle,
    p_receipt_key: receiptKey,
  })
  const result = Array.isArray(data) ? data[0] : data
  if (error || result?.subscription_status !== 'ACTIVE' || !result.confirmed_at) {
    return { success: false, message: 'AeroTrade could not verify your newsletter preference safely.' }
  }
  const { data: readback, error: readbackError } = await admin
    .from('newsletter_public_subscriptions')
    .select('status,confirmed_at,unsubscribed_at')
    .eq('id', subscriptionId)
    .single()
  if (readbackError || readback?.status !== 'ACTIVE' || !readback.confirmed_at || readback.unsubscribed_at) {
    return { success: false, message: 'AeroTrade could not verify your newsletter preference safely.' }
  }

  revalidatePath('/newsletter/subscribe')
  return { success: true, message: 'Confirmed. You will receive the optional bi-weekly AeroTrade marketplace update.' }
}
