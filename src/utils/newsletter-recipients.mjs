import { isActiveNewsletterConsent, normalizeNewsletterEmail } from './newsletter-consent.mjs'

export function isActivePublicNewsletterConsent(subscription) {
  return subscription?.status === 'ACTIVE'
    && Boolean(subscription?.confirmed_at)
    && !subscription?.unsubscribed_at
}

/**
 * @param {{
 *   users?: Array<any>,
 *   publicSubscriptions?: Array<any>,
 *   testEmail?: string | null,
 * }} input
 */
export function buildNewsletterRecipients({ users = [], publicSubscriptions = [], testEmail = null }) {
  const normalizedTestEmail = normalizeNewsletterEmail(testEmail)
  if (testEmail !== null) {
    return {
      recipients: normalizedTestEmail ? [{ id: null, email: normalizedTestEmail, kind: 'test' }] : [],
      skippedInvalidRecipients: normalizedTestEmail ? 0 : 1,
      duplicateRecipients: 0,
    }
  }

  const recipientsByEmail = new Map()
  let invalidRecipients = 0
  let duplicateRecipients = 0

  // Account consent remains authoritative when the same person also completed
  // the public flow. This preserves the existing preference and stop link.
  for (const user of users) {
    const email = normalizeNewsletterEmail(user?.email)
    if (!email || !isActiveNewsletterConsent(user) || !user?.id) {
      invalidRecipients += 1
      continue
    }
    if (recipientsByEmail.has(email)) {
      duplicateRecipients += 1
      continue
    }
    recipientsByEmail.set(email, { id: user.id, email, kind: 'account' })
  }

  for (const subscription of publicSubscriptions) {
    const email = normalizeNewsletterEmail(subscription?.email)
    if (!email || !isActivePublicNewsletterConsent(subscription) || !subscription?.id) {
      invalidRecipients += 1
      continue
    }
    if (recipientsByEmail.has(email)) {
      duplicateRecipients += 1
      continue
    }
    recipientsByEmail.set(email, { id: subscription.id, email, kind: 'public' })
  }

  return {
    recipients: Array.from(recipientsByEmail.values()),
    skippedInvalidRecipients: invalidRecipients + duplicateRecipients,
    duplicateRecipients,
  }
}
