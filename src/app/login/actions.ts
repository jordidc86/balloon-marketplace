'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { escapeHtml } from '@/utils/html'
import { sendEmail } from '@/utils/resend'
import { getApplicationOrigin, getSafeRedirectPath } from '@/utils/navigation.mjs'
import { siteUrl } from '@/utils/site'
import { createPremiumMembershipCheckout } from '@/utils/premium-checkout'

function isRedirectError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred'
}

export async function login(formData: FormData) {
  try {
    const supabase = await createClient()
    const redirectTo = getSafeRedirectPath(formData.get('redirectTo'))

    const data = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    }

    const { error } = await supabase.auth.signInWithPassword(data)

    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}&email=${encodeURIComponent(data.email)}&redirectTo=${encodeURIComponent(redirectTo)}`)
    }

    revalidatePath('/', 'layout')
    redirect(redirectTo)
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    redirect('/login?error=' + encodeURIComponent(getErrorMessage(error)))
  }
}

export async function signup(formData: FormData) {
  try {
    const supabase = await createClient()

    const authData = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    }

    const { data, error } = await supabase.auth.signUp(authData)

    if (error) {
      redirect('/login?error=' + encodeURIComponent(error.message))
    }

    try {
      await sendEmail(
        'jordi.diaz.casaubon@gmail.com',
        'Nuevo usuario en AeroTrade',
        `<p>Se ha registrado un nuevo usuario:</p><p>Email: ${escapeHtml(authData.email)}</p>`
      )
    } catch (e) {
      console.error("Error sending notification:", e)
    }

    if (!data?.session) {
      redirect('/login?message=' + encodeURIComponent('Please check your email to verify your account.'))
    }

    revalidatePath('/', 'layout')
    redirect('/dashboard')
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    redirect('/login?error=' + encodeURIComponent(getErrorMessage(error)))
  }
}


export async function signupWithDetails(formData: FormData) {
  try {
    const supabase = await createClient()

    const name = formData.get('name') as string
    const phone = formData.get('phone') as string
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const isPremiumRequested = formData.get('is_premium') === 'on'
    const redirectTo = getSafeRedirectPath(formData.get('redirectTo'))

    const { data: authData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, phone } 
      }
    })

    if (error) {
      redirect('/signup?error=' + encodeURIComponent(error.message))
    }

    try {
      await sendEmail(
        'jordi.diaz.casaubon@gmail.com',
        'Nuevo usuario en AeroTrade',
        `<p>Se ha registrado un nuevo usuario:</p>
        <p>Email: ${escapeHtml(email)}</p>
        <p>Nombre: ${escapeHtml(name)}</p>
        <p>Teléfono: ${escapeHtml(phone)}</p>
        <p>Solicitó Premium: ${isPremiumRequested ? 'Sí' : 'No'}</p>
        <p>Estado de pago Stripe: ${isPremiumRequested ? 'Pendiente de completar checkout' : 'No solicitado'}</p>`
      )
    } catch (e) {
      console.error("Error sending notification:", e)
    }

    const userId = authData?.user?.id;

    if (isPremiumRequested && userId) {
      const headersList = await import('next/headers').then(m => m.headers())
      const origin = getApplicationOrigin(headersList.get('origin'), siteUrl)
      const checkout = await createPremiumMembershipCheckout({
        userId,
        userEmail: email,
        origin,
        source: 'signup',
        successPath: '/login?message=Payment%20successful.%20Please%20verify%20your%20email%20and%20log%20in.',
        cancelPath: '/login?message=Account%20created.%20After%20verifying%20your%20email%2C%20you%20can%20resume%20Premium%20from%20your%20dashboard.',
      })
      redirect(checkout.url)
    }

    if (!authData?.session) {
      redirect('/login?message=' + encodeURIComponent('Please check your email to verify your account.') + '&redirectTo=' + encodeURIComponent(redirectTo))
    }

    revalidatePath('/', 'layout')
    redirect(redirectTo)
  } catch (error: unknown) {
    if (isRedirectError(error)) throw error
    redirect('/signup?error=' + encodeURIComponent(getErrorMessage(error)))
  }
}

export async function resendConfirmationEmail(email: string) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email,
    })

    if (error) {
       return { error: error.message }
    }

    return { success: true }
  } catch (error: unknown) {
    return { error: getErrorMessage(error) }
  }
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
