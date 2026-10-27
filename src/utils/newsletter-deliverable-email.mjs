import { normalizeNewsletterEmail } from './newsletter-consent.mjs'

// Syntax and consent are separate from delivery eligibility. Keep historical
// confirmation/unsubscribe signature normalization unchanged.
export function normalizeDeliverableNewsletterEmail(value) {
  const email = normalizeNewsletterEmail(value)
  if (!email) return null
  const domain = email.slice(email.lastIndexOf('@') + 1)
  if (['example.com', 'example.net', 'example.org'].some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`))) return null
  if (['example', 'invalid', 'localhost', 'test'].some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`))) return null
  return email
}
