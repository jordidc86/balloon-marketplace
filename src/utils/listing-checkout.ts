import { stripe } from '@/utils/stripe'
import { premiumListingFeeCents } from '@/utils/listing-plans'
import { sellerLaunchPromotionProduct } from '@/utils/paid-product-labels.mjs'
import { createAdminClient } from '@/utils/supabase/server'

export type ListingCheckoutSource = 'initial' | 'dashboard' | 'catalog'

const sessionMatchesListing = (session: { metadata?: Record<string, string> | null }, listingId: string, userId: string) =>
  session.metadata?.type === 'listing_fee'
  && session.metadata?.listing_id === listingId
  && session.metadata?.user_id === userId

async function markIntentTerminal(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  intentId: string,
  status: 'EXPIRED' | 'SUPERSEDED',
) {
  const { data, error } = await admin
    .from('listing_checkout_intents')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', intentId)
    .eq('status', 'STARTED')
    .select('id,status')
    .single()
  if (error || data?.status !== status) {
    throw new Error(`Listing checkout intent could not enter ${status}: ${error?.message || 'readback mismatch'}`)
  }
}

async function expireOpenStripeListingSessions(listingId: string, userId: string) {
  // Pre-ledger sessions may exist without a local intent. Read every recent state so a
  // completed payment can never be bypassed by switching the advert to free.
  const sessions = await stripe.checkout.sessions.list({ limit: 100 })
  const matching = sessions.data.filter((session) => sessionMatchesListing(session, listingId, userId))
  for (const session of matching) {
    if (session.status === 'complete') {
      throw new Error('Seller Launch Promotion payment is already processing; wait for confirmation before publishing free')
    }
    if (session.status === 'open') {
      const expired = await stripe.checkout.sessions.expire(session.id)
      if (expired.status !== 'expired') {
        throw new Error(`Stripe listing checkout ${session.id} did not expire safely`)
      }
    }
  }
  return matching.map((session) => session.id)
}

export async function retireListingCheckoutBeforeFreePublication(listingId: string, userId: string) {
  const admin = await createAdminClient()
  const { data: intents, error: intentsError } = await admin
    .from('listing_checkout_intents')
    .select('id,stripe_session_id,status')
    .eq('listing_id', listingId)
    .eq('user_id', userId)
    .eq('status', 'STARTED')
  if (intentsError) throw new Error(`Listing checkout state could not be read: ${intentsError.message}`)

  for (const intent of intents || []) {
    const session = await stripe.checkout.sessions.retrieve(intent.stripe_session_id)
    if (!sessionMatchesListing(session, listingId, userId)) {
      throw new Error('Stored listing checkout no longer matches its seller and listing')
    }
    if (session.status === 'complete') {
      throw new Error('Seller Launch Promotion payment is already processing; wait for confirmation before publishing free')
    }
    if (session.status === 'open') {
      const expired = await stripe.checkout.sessions.expire(session.id)
      if (expired.status !== 'expired') throw new Error('Open Seller Launch Promotion checkout could not be closed')
    }
    await markIntentTerminal(admin, intent.id, session.status === 'expired' ? 'EXPIRED' : 'SUPERSEDED')
  }

  await expireOpenStripeListingSessions(listingId, userId)
}

export async function createPremiumListingCheckout({
  listingId,
  listingTitle,
  userId,
  origin,
  source,
}: {
  listingId: string
  listingTitle: string
  userId: string
  origin: string
  source: ListingCheckoutSource
}) {
  const admin = await createAdminClient()
  const { data: currentIntent, error: currentIntentError } = await admin
    .from('listing_checkout_intents')
    .select('id,stripe_session_id,status')
    .eq('listing_id', listingId)
    .eq('user_id', userId)
    .eq('status', 'STARTED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (currentIntentError) throw new Error(`Seller Launch Promotion checkout state could not be read: ${currentIntentError.message}`)
  if (currentIntent) {
    const currentSession = await stripe.checkout.sessions.retrieve(currentIntent.stripe_session_id)
    if (!sessionMatchesListing(currentSession, listingId, userId)) {
      throw new Error('Stored Seller Launch Promotion checkout does not match this listing')
    }
    if (currentSession.status === 'open' && currentSession.url) return currentSession.url
    if (currentSession.status === 'complete') {
      throw new Error('Seller Launch Promotion payment is already processing')
    }
    await markIntentTerminal(admin, currentIntent.id, 'EXPIRED')
  }

  // Close any pre-ledger or orphaned open session for this exact seller/listing
  // before creating the single audited replacement.
  await expireOpenStripeListingSessions(listingId, userId)

  const metadata = {
    type: 'listing_fee',
    listing_plan: 'premium',
    listing_id: listingId,
    user_id: userId,
    intent_version: '1',
    checkout_source: source,
  }
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: `${sellerLaunchPromotionProduct.publicName}: ${listingTitle}`,
            description: 'One-time seller promotion: 48-hour buyer early access, alerts, newsletter, rotating social promotion and eligible wanted-buyer matching.',
          },
          unit_amount: premiumListingFeeCents,
        },
        quantity: 1,
      },
    ],
    metadata,
    payment_intent_data: { metadata },
    client_reference_id: listingId,
    mode: 'payment',
    success_url: `${origin}/catalog/${listingId}?success=true`,
    cancel_url: `${origin}/dashboard?listing_payment=canceled`,
  }, {
    idempotencyKey: `listing-fee-${listingId}-${Math.floor(Date.now() / 600000)}`,
  })

  if (!session.url) throw new Error('Failed to create Stripe session')

  const { data: intent, error: intentError } = await admin.rpc('register_listing_checkout_intent', {
    p_listing_id: listingId,
    p_user_id: userId,
    p_stripe_session_id: session.id,
    p_source: source,
  })
  const storedIntent = Array.isArray(intent) ? intent[0] : intent
  if (
    intentError
    || storedIntent?.stripe_session_id !== session.id
    || storedIntent?.listing_id !== listingId
    || storedIntent?.user_id !== userId
    || storedIntent?.status !== 'STARTED'
  ) {
    try {
      await stripe.checkout.sessions.expire(session.id)
    } catch (expiryError) {
      console.error('Could not expire untracked listing checkout session:', expiryError)
    }
    throw new Error(`Seller Launch Promotion checkout could not be audited: ${intentError?.message || 'readback mismatch'}`)
  }
  return session.url
}
