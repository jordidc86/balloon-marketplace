const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const token = /^[0-9a-f]{64}$/i

// Classify the page only. The server actions still verify the signature,
// delivery receipt and current preference before changing any subscription.
export function newsletterConfirmationLinkKind(params, now = Date.now()) {
  const fields = ['id', 'subscription', 'cycle', 'expires', 'token', 'campaign']
  if (!fields.some((field) => params[field] !== undefined)) return 'signup'
  if (fields.some((field) => params[field] !== undefined && typeof params[field] !== 'string')) return 'invalid'
  const expires = Number(params.expires)
  if (!Number.isSafeInteger(expires) || expires < now || !token.test(params.token || '')) return 'invalid'
  if (params.subscription !== undefined) {
    const cycle = Number(params.cycle)
    return params.id === undefined && params.campaign === undefined && uuid.test(params.subscription)
      && Number.isSafeInteger(cycle) && cycle >= 1 && cycle <= 1_000_000
      && expires - now <= 7 * 24 * 60 * 60 * 1000 ? 'public' : 'invalid'
  }
  return params.cycle === undefined && uuid.test(params.id || '')
    && (params.campaign === undefined || /^\d{4}-\d{2}-\d{2}$/.test(params.campaign))
    && expires - now <= 30 * 24 * 60 * 60 * 1000 ? 'account' : 'invalid'
}
