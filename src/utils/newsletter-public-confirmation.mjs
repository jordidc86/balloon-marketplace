import { publicNewsletterConfirmationIdempotencyKey, publicNewsletterConfirmationLifetimeMs, signPublicNewsletterConfirmation } from './newsletter-public-subscription.mjs'

const escapeHtml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

export function buildPublicNewsletterConfirmation({
  subscriptionId,
  email,
  confirmationCycle,
  secret,
  baseUrl,
  now = Date.now(),
}) {
  const idempotencyKey = publicNewsletterConfirmationIdempotencyKey(subscriptionId, confirmationCycle)
  const expiresAt = Number(now) + publicNewsletterConfirmationLifetimeMs
  const token = signPublicNewsletterConfirmation({
    subscriptionId,
    email,
    confirmationCycle,
    expiresAt,
    secret,
  })
  let safeBaseUrl = null
  try {
    const parsed = new URL(baseUrl)
    if (parsed.protocol === 'https:') safeBaseUrl = parsed.origin
  } catch {
    safeBaseUrl = null
  }
  if (!idempotencyKey || !token || !Number.isSafeInteger(expiresAt) || !safeBaseUrl) return null

  const params = new URLSearchParams({
    subscription: subscriptionId,
    cycle: String(confirmationCycle),
    expires: String(expiresAt),
    token,
  })
  const confirmationUrl = `${safeBaseUrl}/newsletter/subscribe?${params.toString()}`
  return {
    idempotencyKey,
    expiresAt,
    confirmationUrl,
    subject: 'Confirm AeroTrade marketplace updates',
    html: `<h1 style="font-size:24px">Confirm AeroTrade marketplace updates</h1><p>You asked to receive the optional bi-weekly hot-air-balloon marketplace update.</p><p><a href="${escapeHtml(confirmationUrl)}"><strong>Review and confirm this request</strong></a></p><p>Opening the link does not subscribe you. The private page asks for an explicit confirmation and the link expires in seven days.</p><p style="font-size:13px;color:#64748b">If you did not request this, do nothing. You will not receive the newsletter.</p>`,
  }
}
