import { escapeHtml } from './html.ts'

export const listingVerificationEvidenceChecklist = [
  'Evidence linking you or your business to the equipment',
  'Registration or serial-plate evidence matching the advert',
  'Relevant maintenance, inspection or manufacturer records that are available',
]

export function listingVerificationEvidenceSubject(listingTitle) {
  return `AeroTrade evidence review: ${String(listingTitle || '').trim()}`
}

export function listingVerificationEvidenceInstructionKey(eventId) {
  const normalized = String(eventId || '').trim().toLowerCase()
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new Error('A valid verification request event is required')
  }
  return `listing-verification-evidence-instructions-${normalized}`
}

export function parseListingVerificationEvidenceInstructionKey(value) {
  const match = /^listing-verification-evidence-instructions-([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(String(value || '').trim())
  return match?.[1]?.toLowerCase() || null
}

export function listingVerificationEvidenceMailto({ adminEmail, listingId, listingTitle }) {
  const email = String(adminEmail || '').trim()
  if (!email || !email.includes('@')) return null
  const subject = listingVerificationEvidenceSubject(listingTitle)
  const body = [
    'Hello AeroTrade,',
    '',
    'I am replying with the evidence requested for my listing review.',
    `Listing: ${String(listingTitle || '').trim()}`,
    `Review reference: ${String(listingId || '').trim()}`,
    '',
    'I understand this is a limited identity and supporting-evidence review, not an airworthiness inspection or proof of legal title.',
  ].join('\n')
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function buildListingVerificationEvidenceInstructions({ adminEmail, listingId, listingTitle, dashboardUrl, listingUrl }) {
  const mailto = listingVerificationEvidenceMailto({ adminEmail, listingId, listingTitle })
  if (!mailto) throw new Error('A verification contact email is required')
  const checklist = listingVerificationEvidenceChecklist.map((item) => `<li>${escapeHtml(item)}</li>`).join('')
  return {
    subject: listingVerificationEvidenceSubject(listingTitle),
    html: `<p>Your limited AeroTrade evidence review for <strong>${escapeHtml(listingTitle)}</strong> is queued.</p><p><strong>Next step:</strong> reply to this email or use the secure handoff link below and attach only the evidence needed for this advert:</p><ul>${checklist}</ul><p><a href="${escapeHtml(mailto)}">Send evidence to AeroTrade</a></p><p>Review reference: <code>${escapeHtml(listingId)}</code></p><p><a href="${escapeHtml(listingUrl)}">Check the public advert</a> · <a href="${escapeHtml(dashboardUrl)}">Open your dashboard</a></p><p>AeroTrade does not upload or retain the document copies in the marketplace database. The resulting badge records only the closed evidence categories reviewed. It does not certify ownership, legal title, airworthiness or physical condition.</p>`,
    replyTo: String(adminEmail).trim(),
  }
}
