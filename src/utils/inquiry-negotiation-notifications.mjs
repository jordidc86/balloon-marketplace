const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const notificationPrefixes = Object.freeze({
  inquiry_buyer_seller_response: 'inquiry-buyer-seller-response-',
  inquiry_seller_buyer_response: 'inquiry-seller-buyer-response-',
})

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseNegotiationNotificationEventId(notificationType, idempotencyKey) {
  const prefix = notificationPrefixes[notificationType]
  if (!prefix || typeof idempotencyKey !== 'string' || !idempotencyKey.startsWith(prefix)) return null
  const eventId = idempotencyKey.slice(prefix.length)
  return uuidPattern.test(eventId) ? eventId.toLowerCase() : null
}

export function buildSellerResponseBuyerNotification({ listing, event, buyerResponseUrl, buyerPortalUrl }) {
  const amount = event.amountMinor === null
    ? null
    : (Number(event.amountMinor) / 100).toLocaleString('en-IE', { style: 'currency', currency: event.currency })
  const heading = event.eventType === 'SELLER_COUNTERED'
    ? `The seller has proposed ${amount}`
    : event.eventType === 'SELLER_DECLINED'
      ? 'The seller has declined this enquiry'
      : 'The seller would like to continue negotiating'
  const detail = event.eventType === 'SELLER_COUNTERED'
    ? `<p>The seller has made a non-binding counteroffer of <strong>${escapeHtml(amount || '')}</strong>.</p>`
    : event.eventType === 'SELLER_DECLINED'
      ? '<p>The seller has declined this opportunity. No reservation, payment or sale has been created.</p>'
      : '<p>The seller has accepted your price indication as a basis for further negotiation.</p>'
  return {
    subject: `AeroTrade negotiation update: ${listing.title}`,
    html: `<h2>${escapeHtml(heading)}</h2>
      <p><strong>Listing:</strong> ${escapeHtml(listing.title)}</p>
      ${detail}
      ${event.note ? `<p><strong>Seller note:</strong><br />${escapeHtml(event.note).replaceAll('\n', '<br />')}</p>` : ''}
      <p>All amounts in this message are invitations to negotiate only. This message does not reserve the equipment, execute a payment or form a sale contract.</p>
      ${buyerResponseUrl ? `<p><a href="${escapeHtml(buyerResponseUrl)}">Respond securely through AeroTrade</a>. This private link expires after 30 days.</p>` : ''}
      ${buyerPortalUrl ? `<p><a href="${escapeHtml(buyerPortalUrl)}">Open the complete private enquiry history</a>. This status link expires after 90 days.</p>` : ''}
      <p>You can also contact the seller at <a href="mailto:${escapeHtml(listing.contactEmail)}">${escapeHtml(listing.contactEmail)}</a> or <a href="${escapeHtml(listing.url)}">return to the listing</a>.</p>`,
  }
}

export function buildBuyerResponseSellerNotification({ listing, inquiry, event, dashboardUrl }) {
  const amount = event.amountMinor === null
    ? null
    : (Number(event.amountMinor) / 100).toLocaleString('en-IE', { style: 'currency', currency: event.currency })
  const responseLabel = event.eventType === 'BUYER_COUNTERED'
    ? `The buyer proposed ${amount}`
    : event.eventType === 'BUYER_DECLINED'
      ? 'The buyer declined this negotiation'
      : 'The buyer wants to continue negotiating'
  return {
    subject: `AeroTrade buyer response: ${listing.title}`,
    html: `<h2>${escapeHtml(responseLabel)}</h2>
      <p><strong>Listing:</strong> ${escapeHtml(listing.title)}</p>
      <p><strong>Buyer:</strong> ${escapeHtml(inquiry.buyerName)}</p>
      ${event.note ? `<p><strong>Buyer note:</strong><br />${escapeHtml(event.note).replaceAll('\n', '<br />')}</p>` : ''}
      <p>This is a non-binding negotiation response. It does not reserve equipment, execute payment or form a sale contract.</p>
      <p><a href="${escapeHtml(dashboardUrl)}">Open the enquiry in your AeroTrade dashboard</a></p>`,
  }
}
