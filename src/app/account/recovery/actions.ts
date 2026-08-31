'use server'

import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/utils/supabase/server'
import { verifyAccountRecoveryCapability } from '@/utils/account-recovery.mjs'
import { siteUrl } from '@/utils/site'

const value = (formData: FormData, name: string) => {
  const item = formData.get(name)
  return typeof item === 'string' ? item.trim() : ''
}

export async function beginAccountRecovery(formData: FormData) {
  const userId = value(formData, 'id')
  const expiresAt = value(formData, 'expires')
  const token = value(formData, 'token')
  const admin = await createAdminClient()
  const [{ data: profile }, { data: receipt }] = await Promise.all([
    admin.from('users').select('id,email').eq('id', userId).maybeSingle(),
    admin
      .from('commercial_notification_receipts')
      .select('id,status,provider_message_id,consumed_at,accepted_at')
      .eq('notification_type', 'account_password_recovery')
      .eq('entity_type', 'user')
      .eq('entity_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const authorized = Boolean(profile?.id && profile.email
    && receipt?.id && receipt.status === 'accepted' && receipt.provider_message_id && !receipt.consumed_at
    && verifyAccountRecoveryCapability({
      userId: profile.id,
      email: profile.email,
      expiresAt,
      token,
      secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
    }))
  if (!authorized || !profile || !receipt) {
    redirect('/forgot-password?error=' + encodeURIComponent('This recovery link is invalid, expired or already used. Request a new one.'))
  }

  const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: profile.email,
    options: { redirectTo: `${siteUrl}/reset-password` },
  })
  const tokenHash = generated?.properties?.hashed_token
  if (generateError || !tokenHash) {
    redirect('/forgot-password?error=' + encodeURIComponent('A secure recovery session could not be created. Request a new link.'))
  }

  const consumedAt = new Date().toISOString()
  const { data: claimed, error: claimError } = await admin
    .from('commercial_notification_receipts')
    .update({ consumed_at: consumedAt })
    .eq('id', receipt.id)
    .is('consumed_at', null)
    .select('id,consumed_at')
    .maybeSingle()
  if (claimError || claimed?.consumed_at !== consumedAt) {
    redirect('/forgot-password?error=' + encodeURIComponent('This recovery link was already used. Request a new one.'))
  }

  const session = await createClient()
  const { error: verifyError } = await session.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
  if (verifyError) {
    redirect('/forgot-password?error=' + encodeURIComponent('The recovery session could not be verified. Request a new link.'))
  }
  redirect('/reset-password')
}
