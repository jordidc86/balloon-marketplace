'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { verifyNewsletterUnsubscribeCapability } from '@/utils/newsletter-consent.mjs'
import { verifyPublicNewsletterUnsubscribe } from '@/utils/newsletter-public-subscription.mjs'

export type NewsletterUnsubscribeState = { success: boolean; message: string }

export async function unsubscribeNewsletter(
  _state: NewsletterUnsubscribeState,
  formData: FormData,
): Promise<NewsletterUnsubscribeState> {
  const userId = typeof formData.get('id') === 'string' ? String(formData.get('id')).trim() : ''
  const token = typeof formData.get('token') === 'string' ? String(formData.get('token')).trim() : ''
  const admin = await createAdminClient()
  const { data: profile, error } = await admin
    .from('users')
    .select('id,email,newsletter_consent_status,newsletter_consented_at,newsletter_unsubscribed_at')
    .eq('id', userId)
    .maybeSingle()
  if (error || !profile) return { success: false, message: 'This preference link is invalid.' }

  if (!verifyNewsletterUnsubscribeCapability({
    userId: profile.id,
    email: profile.email,
    token,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })) {
    return { success: false, message: 'This preference link is invalid.' }
  }
  if (profile.newsletter_consent_status === 'UNSUBSCRIBED' && profile.newsletter_unsubscribed_at) {
    return { success: true, message: 'Marketplace update emails are already stopped.' }
  }

  const unsubscribedAt = new Date().toISOString()
  const { data: updated, error: updateError } = await admin
    .from('users')
    .update({
      newsletter_consent_status: 'UNSUBSCRIBED',
      newsletter_unsubscribed_at: unsubscribedAt,
    })
    .eq('id', profile.id)
    .select('newsletter_consent_status,newsletter_unsubscribed_at')
    .single()
  if (updateError || updated?.newsletter_consent_status !== 'UNSUBSCRIBED' || !updated.newsletter_unsubscribed_at) {
    return { success: false, message: 'AeroTrade could not stop these emails safely.' }
  }
  return { success: true, message: 'You will no longer receive the bi-weekly marketplace update.' }
}

export async function unsubscribePublicNewsletter(
  _state: NewsletterUnsubscribeState,
  formData: FormData,
): Promise<NewsletterUnsubscribeState> {
  const subscriptionId = typeof formData.get('subscription') === 'string' ? String(formData.get('subscription')).trim() : ''
  const token = typeof formData.get('token') === 'string' ? String(formData.get('token')).trim() : ''
  const admin = await createAdminClient()
  const { data: subscription, error } = await admin
    .from('newsletter_public_subscriptions')
    .select('id,email,status,unsubscribed_at')
    .eq('id', subscriptionId)
    .maybeSingle()
  if (error || !subscription || !verifyPublicNewsletterUnsubscribe({
    subscriptionId: subscription.id,
    email: subscription.email,
    token,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })) return { success: false, message: 'This preference link is invalid.' }
  if (subscription.status === 'UNSUBSCRIBED' && subscription.unsubscribed_at) {
    return { success: true, message: 'Marketplace update emails are already stopped.' }
  }

  const { data, error: updateError } = await admin.rpc('unsubscribe_public_newsletter', { p_subscription_id: subscription.id })
  const result = Array.isArray(data) ? data[0] : data
  if (updateError || result?.subscription_status !== 'UNSUBSCRIBED' || !result.unsubscribed_at) {
    return { success: false, message: 'AeroTrade could not stop these emails safely.' }
  }
  const { data: readback, error: readbackError } = await admin
    .from('newsletter_public_subscriptions')
    .select('status,unsubscribed_at')
    .eq('id', subscription.id)
    .single()
  if (readbackError || readback?.status !== 'UNSUBSCRIBED' || !readback.unsubscribed_at) {
    return { success: false, message: 'AeroTrade could not stop these emails safely.' }
  }
  return { success: true, message: 'You will no longer receive the bi-weekly marketplace update.' }
}
