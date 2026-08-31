'use server'

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/utils/supabase/server'
import {
  accountRecoveryCapabilityLifetimeMs,
  accountRecoveryRequestCooldownMs,
  normalizeAccountRecoveryEmail,
  signAccountRecoveryCapability,
} from '@/utils/account-recovery.mjs'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { escapeHtml } from '@/utils/html'
import { siteUrl } from '@/utils/site'

const neutralSuccessMessage = 'If that email belongs to an AeroTrade account, a secure password-reset link has been sent.'

export async function requestPasswordReset(formData: FormData) {
  const email = normalizeAccountRecoveryEmail(formData.get('email'))
  if (!email) redirect('/forgot-password?error=' + encodeURIComponent('Enter a valid email address.'))

  try {
    const admin = await createAdminClient()
    const { data: profile } = await admin.from('users').select('id,email,role').eq('email', email).maybeSingle()
    if (profile?.id && profile.email) {
      const cooldownCutoff = new Date(Date.now() - accountRecoveryRequestCooldownMs).toISOString()
      const { data: recent } = await admin
        .from('commercial_notification_receipts')
        .select('id')
        .eq('notification_type', 'account_password_recovery')
        .eq('entity_type', 'user')
        .eq('entity_id', profile.id)
        .gte('created_at', cooldownCutoff)
        .limit(1)
        .maybeSingle()
      if (!recent?.id) {
        const expiresAt = Date.now() + accountRecoveryCapabilityLifetimeMs
        const token = signAccountRecoveryCapability({
          userId: profile.id,
          email: profile.email,
          expiresAt,
          secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
        })
        if (!token) throw new Error('Recovery capability could not be created')
        const params = new URLSearchParams({ id: profile.id, expires: String(expiresAt), token })
        const recoveryUrl = `${siteUrl}/account/recovery?${params.toString()}`
        const recoveryWindow = Math.floor(Date.now() / accountRecoveryRequestCooldownMs)
        await sendCommercialReceiptEmail(admin, {
          notificationType: 'account_password_recovery',
          entityType: 'user',
          entityId: profile.id,
          recipientRole: 'seller',
          to: profile.email,
          subject: 'Recover your AeroTrade account',
          html: `<h2>Recover your AeroTrade account</h2><p>A password reset was requested for this email address.</p><p><a href="${escapeHtml(recoveryUrl)}">Continue securely</a></p><p>Opening the link does not change the password. You must explicitly confirm before choosing a new one. The link expires after 30 minutes.</p><p>If you did not request this, ignore the email.</p>`,
          idempotencyKey: `account-password-recovery-${profile.id}-${recoveryWindow}`,
        })
      }
    }
  } catch (error) {
    console.error('Password reset request failed safely:', error instanceof Error ? error.name : 'unknown')
  }

  redirect('/forgot-password?message=' + encodeURIComponent(neutralSuccessMessage))
}
