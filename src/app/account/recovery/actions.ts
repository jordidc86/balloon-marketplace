'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/server'
import { validateAccountPasswordChange, verifyAccountRecoveryCapability } from '@/utils/account-recovery.mjs'

const value = (formData: FormData, name: string) => {
  const item = formData.get(name)
  return typeof item === 'string' ? item.trim() : ''
}

const recoveryFormUrl = (formData: FormData, error: string) => {
  const params = new URLSearchParams({
    id: value(formData, 'id'),
    expires: value(formData, 'expires'),
    request: value(formData, 'request'),
    token: value(formData, 'token'),
    error,
  })
  return `/account/recovery?${params.toString()}`
}

export async function completeAccountRecovery(formData: FormData) {
  const userId = value(formData, 'id')
  const expiresAt = value(formData, 'expires')
  const requestId = value(formData, 'request')
  const token = value(formData, 'token')
  const validation = validateAccountPasswordChange(formData.get('password'), formData.get('password_confirmation'))
  if (!validation.valid) redirect(recoveryFormUrl(formData, validation.error || 'The new password is not valid.'))

  const admin = await createAdminClient()
  const [{ data: profile }, { data: receipt }] = await Promise.all([
    admin.from('users').select('id,email').eq('id', userId).maybeSingle(),
    admin
      .from('commercial_notification_receipts')
      .select('id,status,provider_message_id,consumed_at,accepted_at')
      .eq('notification_type', 'account_password_recovery')
      .eq('entity_type', 'user')
      .eq('entity_id', userId)
      .eq('idempotency_key', requestId)
      .maybeSingle(),
  ])

  const authorized = Boolean(profile?.id && profile.email
    && receipt?.id && receipt.status === 'accepted' && receipt.provider_message_id && !receipt.consumed_at
    && verifyAccountRecoveryCapability({
      userId: profile.id,
      email: profile.email,
      expiresAt,
      requestId,
      token,
      secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }))
  if (!authorized || !profile || !receipt) {
    redirect('/forgot-password?error=' + encodeURIComponent('This recovery link is invalid, expired or already used. Request a new one.'))
  }

  const consumedAt = new Date().toISOString()
  const { data: claimed, error: claimError } = await admin
    .from('commercial_notification_receipts')
    .update({ consumed_at: consumedAt })
    .eq('id', receipt.id)
    .is('consumed_at', null)
    .select('id,consumed_at')
    .maybeSingle()
  if (claimError || !claimed?.id || !claimed.consumed_at) {
    redirect('/forgot-password?error=' + encodeURIComponent('This recovery link was already used. Request a new one.'))
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(profile.id, { password: validation.password })
  if (updateError) {
    await admin.from('commercial_notification_receipts').update({ consumed_at: null }).eq('id', receipt.id).eq('consumed_at', consumedAt)
    redirect(recoveryFormUrl(formData, 'The password could not be changed. Request a new recovery email and try again.'))
  }
  redirect('/login?message=' + encodeURIComponent('Password updated. Log in with your new password.'))
}
