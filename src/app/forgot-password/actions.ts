'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { normalizeAccountRecoveryEmail } from '@/utils/account-recovery.mjs'
import { siteUrl } from '@/utils/site'

const neutralSuccessMessage = 'If that email belongs to an AeroTrade account, a secure password-reset link has been sent.'

export async function requestPasswordReset(formData: FormData) {
  const email = normalizeAccountRecoveryEmail(formData.get('email'))
  if (!email) redirect('/forgot-password?error=' + encodeURIComponent('Enter a valid email address.'))

  try {
    const supabase = await createClient()
    const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent('/reset-password')}`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) console.error('Password reset request was not accepted:', error.code || error.name)
  } catch (error) {
    console.error('Password reset request failed safely:', error instanceof Error ? error.name : 'unknown')
  }

  redirect('/forgot-password?message=' + encodeURIComponent(neutralSuccessMessage))
}
