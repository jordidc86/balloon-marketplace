import { normalizeDeliverableNewsletterEmail } from './newsletter-deliverable-email.mjs'
import { isActivePublicNewsletterConsent } from './newsletter-recipients.mjs'
import { newsletterConsentInvitationReceiptKey, signNewsletterConsentInvitationCapability } from './newsletter-consent.mjs'

export function selectNewsletterRenewalRecipients({ users, publicSubscriptions, exclusions }) {
  const excluded = new Set(exclusions.map(x => x.user_id))
  // An active or opted-out public preference must not receive an account invitation.
  const publicPreferences = new Set(publicSubscriptions.filter(x => isActivePublicNewsletterConsent(x) || x.status === 'UNSUBSCRIBED').map(x => normalizeDeliverableNewsletterEmail(x.email)))
  const selected = new Map()
  for (const u of [...users].sort((a, b) => a.id.localeCompare(b.id))) {
    const email = normalizeDeliverableNewsletterEmail(u.email)
    if (!email || u.role === 'admin' || u.newsletter_consent_status !== 'NOT_REQUESTED' || u.newsletter_consented_at || u.newsletter_unsubscribed_at || excluded.has(u.id) || publicPreferences.has(email)) continue
    if (!selected.has(email)) selected.set(email, { id: u.id, email })
  }
  return [...selected.values()]
}

export function buildNewsletterRenewal({ id, email, campaign, expiresAt, secret }) {
  const token = signNewsletterConsentInvitationCapability({ userId: id, email, campaign, expiresAt, secret })
  const idempotencyKey = newsletterConsentInvitationReceiptKey(id, campaign)
  if (!campaign || !token || !idempotencyKey || !normalizeDeliverableNewsletterEmail(email)) throw new Error('Invalid renewal invitation')
  const url = 'https://aerotrade.app/newsletter/subscribe?' + new URLSearchParams({ id, campaign, expires: String(expiresAt), token })
  const escaped = url.replaceAll('&', '&amp;')
  return {
    idempotencyKey,
    subject: 'AeroTrade newsletter update — please confirm your preference',
    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#16213b;line-height:1.6"><h1 style="font-size:24px">Would you like to receive AeroTrade updates?</h1><p>You have an AeroTrade account. We have updated our optional marketplace newsletter and are checking your email preferences.</p><p>We do not currently have an active newsletter confirmation for this address. If you received an earlier invitation, its confirmation link may have expired. Please use the new link below if you would like to subscribe.</p><p>The newsletter includes hot-air-balloon equipment and marketplace updates, at most twice a month.</p><p style="margin:28px 0"><a href="${escaped}" style="display:inline-block;background:#25398c;color:white;padding:14px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Review and confirm my subscription</a></p><p>Opening the link does not subscribe you: the page asks you to confirm. You can unsubscribe from every newsletter.</p><p>If you do not want these updates, no action is needed and you will remain unsubscribed. This is a one-time preference invitation; account and service messages are separate. The link expires in 30 days.</p><p>Thank you,<br>The AeroTrade team</p></div>`,
  }
}
