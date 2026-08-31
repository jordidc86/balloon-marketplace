'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { validateAccountPasswordChange } from '@/utils/account-recovery.mjs'

export async function setRecoveredPassword(formData: FormData) {
  const validation = validateAccountPasswordChange(formData.get('password'), formData.get('password_confirmation'))
  if (!validation.valid) redirect('/reset-password?error=' + encodeURIComponent(validation.error || 'The new password is not valid.'))

  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    redirect('/forgot-password?error=' + encodeURIComponent('This recovery link is invalid or has expired. Request a new one.'))
  }

  const { error } = await supabase.auth.updateUser({ password: validation.password })
  if (error) {
    console.error('Password recovery update was rejected:', error.code || error.name)
    redirect('/reset-password?error=' + encodeURIComponent('The password could not be changed. Request a new recovery link and try again.'))
  }

  await supabase.auth.signOut()
  redirect('/login?message=' + encodeURIComponent('Password updated. Log in with your new password.'))
}
