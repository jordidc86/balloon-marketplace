'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { getApplicationOrigin } from '@/utils/navigation.mjs'
import { siteUrl } from '@/utils/site'
import { createPremiumMembershipCheckout } from '@/utils/premium-checkout'

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

  const headersList = await import('next/headers').then(m => m.headers())
  const origin = getApplicationOrigin(headersList.get('origin'), siteUrl)
  const checkout = await createPremiumMembershipCheckout({
    userId: user.id,
    userEmail: user.email || '',
    stripeCustomerId: profile?.stripe_customer_id,
    origin,
    source: 'pricing',
    successPath: '/dashboard?upgraded=true',
    cancelPath: '/dashboard?premium_payment=canceled',
  })
  redirect(checkout.url)
}
