const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const paymentTypeLabels = {
  listing_fee: sellerLaunchPromotionProduct.paymentLabelEs,
  premium_subscription: buyerEarlyAccessProduct.paymentLabelEs,
  other: 'otro cobro de AeroTrade',
}

const stripeIdPatterns = {
  eventId: /^evt_[A-Za-z0-9_]+$/,
  chargeId: /^ch_[A-Za-z0-9_]+$/,
  paymentIntentId: /^pi_[A-Za-z0-9_]+$/,
  invoiceId: /^in_[A-Za-z0-9_]+$/,
  subscriptionId: /^sub_[A-Za-z0-9_]+$/,
  checkoutSessionId: /^cs_(?:test|live)_[A-Za-z0-9_]+$/,
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const optionalStripeId = (value, pattern, label) => {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  if (!pattern.test(normalized)) throw new Error(`A valid Stripe ${label} is required.`)
  return normalized
}

const requiredStripeId = (value, pattern, label) => {
  const normalized = optionalStripeId(value, pattern, label)
  if (!normalized) throw new Error(`A valid Stripe ${label} is required.`)
  return normalized
}

const optionalUuid = (value, label) => {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  if (!uuidPattern.test(normalized)) throw new Error(`A valid ${label} is required when supplied.`)
  return normalized.toLowerCase()
}

export function normalizePaymentType(value) {
  const normalized = String(value || '').trim()
  return Object.hasOwn(paymentTypeLabels, normalized) ? normalized : 'other'
}

export function formatPaymentAmount(amountMinor, currency = 'eur') {
  const amount = Number(amountMinor)
  if (!Number.isFinite(amount)) {
    throw new Error('Payment amount must be a finite minor-unit value.')
  }

  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: String(currency || 'eur').toUpperCase(),
  }).format(amount / 100)
}

export function paymentNotificationIdempotencyKey(chargeId) {
  const normalized = String(chargeId || '').trim()
  if (!stripeIdPatterns.chargeId.test(normalized)) {
    throw new Error('A valid Stripe charge id is required for payment notification idempotency.')
  }

  return `aerotrade-payment-${normalized}`
}

export function buildPaymentNotification({
  chargeId,
  amount,
  currency,
  createdAt,
  customerEmail,
  paymentType,
  product,
  description,
  dashboardUrl,
}) {
  const formattedAmount = formatPaymentAmount(amount, currency)
  const normalizedPaymentType = normalizePaymentType(paymentType)
  const typeLabel = paymentTypeLabels[normalizedPaymentType]
  const requestedProductLabel = String(product || description || '').trim()
  const productLabel = (requestedProductLabel || typeLabel).slice(0, 500)
  const timestamp = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Madrid',
  }).format(new Date(createdAt))
  const emailLabel = String(customerEmail || '').trim() || 'No disponible en Stripe'
  const safeDashboardUrl = /^https:\/\/dashboard\.stripe\.com\//.test(String(dashboardUrl || ''))
    ? String(dashboardUrl)
    : null

  return {
    subject: `AeroTrade: cobro recibido · ${formattedAmount} · ${typeLabel}`,
    html: `
      <h2>Nuevo cobro recibido en AeroTrade</h2>
      <p><strong>Importe bruto:</strong> ${escapeHtml(formattedAmount)}</p>
      <p><strong>Concepto:</strong> ${escapeHtml(productLabel)}</p>
      <p><strong>Tipo:</strong> ${escapeHtml(typeLabel)}</p>
      <p><strong>Cliente:</strong> ${escapeHtml(emailLabel)}</p>
      <p><strong>Fecha:</strong> ${escapeHtml(timestamp)}</p>
      ${safeDashboardUrl ? `<p><a href="${escapeHtml(safeDashboardUrl)}">Ver el cobro en Stripe</a></p>` : ''}
      <p>Este aviso se genera una sola vez a partir de un evento firmado de Stripe.</p>
    `,
    idempotencyKey: paymentNotificationIdempotencyKey(chargeId),
    paymentType: normalizedPaymentType,
    productLabel,
  }
}

export function buildPaymentNotificationReceipt({
  eventId,
  chargeId,
  paymentIntentId,
  invoiceId,
  subscriptionId,
  checkoutSessionId,
  userId,
  listingId,
  amount,
  currency,
  paymentType,
  product,
  providerMessageId,
  livemode,
  acceptedAt,
}) {
  const amountMinor = Number(amount)
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new Error('Payment receipt amount must be a non-negative integer in minor units.')
  }

  const currencyCode = String(currency || '').trim().toLowerCase()
  if (!/^[a-z]{3}$/.test(currencyCode)) {
    throw new Error('Payment receipt currency must be a three-letter code.')
  }

  const providerId = String(providerMessageId || '').trim()
  if (!providerId || providerId.length > 255) {
    throw new Error('A provider acceptance identifier is required for the payment receipt.')
  }

  const acceptedDate = new Date(acceptedAt)
  if (Number.isNaN(acceptedDate.getTime())) {
    throw new Error('A valid payment notification acceptance time is required.')
  }
  const requestedProductLabel = String(product || '').trim()

  return {
    stripe_event_id: requiredStripeId(eventId, stripeIdPatterns.eventId, 'event id'),
    charge_id: requiredStripeId(chargeId, stripeIdPatterns.chargeId, 'charge id'),
    payment_intent_id: optionalStripeId(paymentIntentId, stripeIdPatterns.paymentIntentId, 'payment intent id'),
    invoice_id: optionalStripeId(invoiceId, stripeIdPatterns.invoiceId, 'invoice id'),
    subscription_id: optionalStripeId(subscriptionId, stripeIdPatterns.subscriptionId, 'subscription id'),
    stripe_checkout_session_id: optionalStripeId(checkoutSessionId, stripeIdPatterns.checkoutSessionId, 'checkout session id'),
    user_id: optionalUuid(userId, 'AeroTrade user id'),
    listing_id: optionalUuid(listingId, 'AeroTrade listing id'),
    amount_minor: amountMinor,
    currency: currencyCode,
    payment_type: normalizePaymentType(paymentType),
    product_label: (
      requestedProductLabel || paymentTypeLabels[normalizePaymentType(paymentType)]
    ).slice(0, 500),
    livemode: Boolean(livemode),
    provider_message_id: providerId,
    accepted_at: acceptedDate.toISOString(),
  }
}

export function matchesPaymentNotificationReceipt(stored, expected) {
  if (!stored || !expected) return false
  return String(stored.charge_id || '') === String(expected.charge_id || '')
    && Number(stored.amount_minor) === Number(expected.amount_minor)
    && String(stored.currency || '').toLowerCase() === String(expected.currency || '').toLowerCase()
    && normalizePaymentType(stored.payment_type) === normalizePaymentType(expected.payment_type)
    && String(stored.provider_message_id || '') === String(expected.provider_message_id || '')
    && String(stored.stripe_checkout_session_id || '') === String(expected.stripe_checkout_session_id || '')
    && String(stored.user_id || '') === String(expected.user_id || '')
    && String(stored.listing_id || '') === String(expected.listing_id || '')
}
import { buyerEarlyAccessProduct, sellerLaunchPromotionProduct } from './paid-product-labels.mjs'
