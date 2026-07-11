'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getApplicationOrigin } from '@/utils/navigation.mjs'
import { siteUrl } from '@/utils/site'

export async function createPremiumCheckout() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: profile } = await supabase
    .from('users')
    .select('is_premium, stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (profile?.is_premium) {
    redirect('/dashboard')
  }

  const { stripe } = await import('@/utils/stripe')
  const headersList = await import('next/headers').then(m => m.headers())
  const origin = getApplicationOrigin(headersList.get('origin'), siteUrl)

  // We use a recurring subscription session in Stripe
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
          recurring: {
            interval: 'year',
          }
        },
        quantity: 1,
      },
    ],
    customer: profile?.stripe_customer_id || undefined,
    customer_email: profile?.stripe_customer_id ? undefined : user.email,
    metadata: {
      type: 'premium_subscription',
      user_id: user.id
    },
    mode: 'subscription',
    success_url: `${origin}/dashboard?upgraded=true`,
    cancel_url: `${origin}/pricing?canceled=true`,
  }, {
    idempotencyKey: `premium-checkout-${user.id}-${Math.floor(Date.now() / 600000)}`,
  })

  // Redirect to Stripe Checkout
  if (session.url) {
    redirect(session.url)
  } else {
    throw new Error('Failed to create Stripe session')
  }
}
