'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/server'
import { verifyNewsletterConsentInvitationCapability } from '@/utils/newsletter-consent.mjs'

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
