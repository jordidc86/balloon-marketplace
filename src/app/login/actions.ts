'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

function isRedirectError(error: any): boolean {
  return typeof error === 'object' && error !== null && 'digest' in error && typeof error.digest === 'string' && error.digest.startsWith('NEXT_REDIRECT')
}

export async function login(formData: FormData) {
  try {
    const supabase = await createClient()

    const data = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    }

    const { error } = await supabase.auth.signInWithPassword(data)

    if (error) {
      redirect('/login?error=' + encodeURIComponent(error.message))
    }

    revalidatePath('/', 'layout')
    redirect('/dashboard')
  } catch (error: any) {
    if (isRedirectError(error)) throw error
    redirect('/login?error=' + encodeURIComponent(error.message || 'An unexpected error occurred'))
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

    if (!data?.session) {
      redirect('/login?message=' + encodeURIComponent('Please check your email to verify your account.'))
    }

    revalidatePath('/', 'layout')
    redirect('/dashboard')
  } catch (error: any) {
    if (isRedirectError(error)) throw error
    redirect('/login?error=' + encodeURIComponent(error.message || 'An unexpected error occurred'))
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

    const userId = authData?.user?.id;

    if (isPremiumRequested && userId) {
      const { stripe } = await import('@/utils/stripe')
      const headersList = await import('next/headers').then(m => m.headers())
      const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
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
      })

      if (session.url) {
        redirect(session.url)
      }
    }

    if (!authData?.session) {
      redirect('/login?message=' + encodeURIComponent('Please check your email to verify your account.'))
    }

    revalidatePath('/', 'layout')
    redirect('/dashboard')
  } catch (error: any) {
    if (isRedirectError(error)) throw error
    redirect('/signup?error=' + encodeURIComponent(error.message || 'An unexpected error occurred'))
  }
}

export async function signout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
