import { stripe } from '@/utils/stripe'
import { premiumListingFeeCents } from '@/utils/listing-plans'
import { sellerLaunchPromotionProduct } from '@/utils/paid-product-labels.mjs'
import { createAdminClient } from '@/utils/supabase/server'

export type ListingCheckoutSource = 'initial' | 'dashboard' | 'catalog'

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

  const admin = await createAdminClient()
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
