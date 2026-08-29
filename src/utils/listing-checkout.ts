import { stripe } from '@/utils/stripe'
import { premiumListingFeeCents } from '@/utils/listing-plans'
import { sellerLaunchPromotionProduct } from '@/utils/paid-product-labels.mjs'

export async function createPremiumListingCheckout({
  listingId,
  listingTitle,
  userId,
  origin,
}: {
  listingId: string
  listingTitle: string
  userId: string
  origin: string
}) {
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
    metadata: {
      type: 'listing_fee',
      listing_plan: 'premium',
      listing_id: listingId,
      user_id: userId,
    },
    mode: 'payment',
    success_url: `${origin}/catalog/${listingId}?success=true`,
    cancel_url: `${origin}/dashboard?listing_payment=canceled`,
  }, {
    idempotencyKey: `listing-fee-${listingId}-${Math.floor(Date.now() / 600000)}`,
  })

  if (!session.url) throw new Error('Failed to create Stripe session')
  return session.url
}
