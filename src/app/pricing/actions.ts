'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export async function createPremiumCheckout() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { stripe } = await import('@/utils/stripe')
  const headersList = await import('next/headers').then(m => m.headers())
  const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

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
    metadata: {
      type: 'premium_subscription',
      user_id: user.id
    },
    mode: 'subscription',
    success_url: `${origin}/dashboard?upgraded=true`,
    cancel_url: `${origin}/pricing?canceled=true`,
  })

  // Redirect to Stripe Checkout
  if (session.url) {
    redirect(session.url)
  } else {
    throw new Error('Failed to create Stripe session')
  }
}
