const premiumCheckoutSources = ['signup', 'pricing', 'dashboard', 'admin']

function trustedPath(value, fallback) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : fallback
}

export function buildPremiumCheckoutParams({
  userId,
  userEmail,
  stripeCustomerId,
  origin,
  source,
  successPath,
  cancelPath,
}) {
  if (!premiumCheckoutSources.includes(source)) throw new Error('Invalid Premium checkout source')
  if (typeof userId !== 'string' || !userId.trim()) throw new Error('Missing Premium checkout user')
  const safeOrigin = new URL(origin).origin
  const safeSuccessPath = trustedPath(successPath, '/dashboard?premium_payment=processing')
  const safeCancelPath = trustedPath(cancelPath, '/dashboard?premium_payment=canceled')

  return {
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
    success_url: `${safeOrigin}${safeSuccessPath}`,
    cancel_url: `${safeOrigin}${safeCancelPath}`,
  }
}
