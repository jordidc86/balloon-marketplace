const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

const paymentTypeLabels = {
  listing_fee: 'anuncio Premium',
  premium_subscription: 'suscripción Premium Club',
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

export function paymentNotificationIdempotencyKey(eventId) {
  const normalized = String(eventId || '').trim()
  if (!/^evt_[A-Za-z0-9_]+$/.test(normalized)) {
    throw new Error('A valid Stripe event id is required for payment notification idempotency.')
  }

  return `aerotrade-payment-${normalized}`
}

export function buildPaymentNotification({
  eventId,
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
  const typeLabel = paymentTypeLabels[paymentType] || 'cobro de AeroTrade'
  const productLabel = String(product || description || typeLabel).trim()
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
    idempotencyKey: paymentNotificationIdempotencyKey(eventId),
  }
}
