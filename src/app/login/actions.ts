'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { escapeHtml } from '@/utils/html'
import { sendEmail } from '@/utils/resend'
import { getApplicationOrigin, getSafeRedirectPath } from '@/utils/navigation.mjs'
import { siteUrl } from '@/utils/site'

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
      const { stripe } = await import('@/utils/stripe')
      const headersList = await import('next/headers').then(m => m.headers())
      const origin = getApplicationOrigin(headersList.get('origin'), siteUrl)

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: email,
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name: 'AeroTrade Premium Club',
                description: '48-hour Early Access & Instant Alerts',
              },
              unit_amount: 999, // 9.99 EUR in cents
              recurring: { interval: 'year' }
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: 'premium_subscription',
          user_id: userId
        },
        mode: 'subscription',
        success_url: `${origin}/login?message=Payment successful! Please check your email to verify your account and access your Premium Dashboard.`,
        cancel_url: `${origin}/login?message=Account created! Please check your email to verify. You can upgrade to Premium in the dashboard anytime.`
      }, {
        idempotencyKey: `premium-signup-${userId}-${Math.floor(Date.now() / 600000)}`,
      })

      if (session.url) {
        redirect(session.url)
      }
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
