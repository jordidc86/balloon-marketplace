import { createAdminClient } from '@/utils/supabase/server'
import { stripe } from '@/utils/stripe'

type PremiumCheckoutSource = 'signup' | 'pricing' | 'dashboard'

export async function createPremiumMembershipCheckout({
  userId,
  userEmail,
  stripeCustomerId,
  origin,
  source,
  successPath,
  cancelPath,
}: {
  userId: string
  userEmail: string
  stripeCustomerId?: string | null
  origin: string
  source: PremiumCheckoutSource
  successPath: string
  cancelPath: string
}) {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'eur',
        product_data: {
          name: 'AeroTrade Premium Club',
          description: '48-hour Early Access & Instant Alerts',
        },
        unit_amount: 999,
        recurring: { interval: 'year' },
      },
      quantity: 1,
    }],
    customer: stripeCustomerId || undefined,
    customer_email: stripeCustomerId ? undefined : userEmail,
    metadata: {
      type: 'premium_subscription',
      user_id: userId,
      intent_version: '1',
      checkout_source: source,
    },
    mode: 'subscription',
    success_url: `${origin}${successPath}`,
    cancel_url: `${origin}${cancelPath}`,
  }, {
    idempotencyKey: `premium-${source}-${userId}-${Math.floor(Date.now() / 600000)}`,
  })

  if (!session.url) throw new Error('Failed to create Stripe session')

  const admin = await createAdminClient()
  const { data: stored, error } = await admin
    .from('premium_checkout_intents')
    .insert({
      user_id: userId,
      stripe_session_id: session.id,
      source,
      status: 'STARTED',
    })
    .select('id,stripe_session_id,status')
    .single()

  if (error?.code === '23505') {
    const { data: duplicate, error: duplicateError } = await admin
      .from('premium_checkout_intents')
      .select('id,user_id,stripe_session_id,status')
      .eq('stripe_session_id', session.id)
      .eq('user_id', userId)
      .single()
    if (duplicateError || !duplicate?.id) throw new Error('Premium checkout intent collision could not be verified')
  } else if (error || !stored?.id || stored.stripe_session_id !== session.id || stored.status !== 'STARTED') {
    try {
      if (session.status === 'open') await stripe.checkout.sessions.expire(session.id)
    } catch (expireError) {
      console.error('Untracked Premium checkout could not be expired:', expireError)
    }
    throw new Error('Premium checkout was not durably recorded')
  }

  await admin
    .from('premium_checkout_intents')
    .update({ status: 'SUPERSEDED', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('status', 'STARTED')
    .neq('stripe_session_id', session.id)

  return { url: session.url, sessionId: session.id }
}
