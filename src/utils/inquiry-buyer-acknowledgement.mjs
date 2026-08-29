const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

export function buildInquiryBuyerAcknowledgement({ listingTitle, listingUrl, buyerPortalUrl, indicativeOffer }) {
  return {
    subject: `AeroTrade received your enquiry about ${listingTitle}`,
    html: `<h2>Your enquiry is safely recorded</h2>
      <p>We have sent your enquiry about <strong>${escapeHtml(listingTitle)}</strong> to the seller.</p>
      ${indicativeOffer ? `<p>Your non-binding price indication of <strong>${escapeHtml(indicativeOffer)}</strong> was recorded. It does not reserve the equipment or form a sale contract.</p>` : ''}
      <p>The seller now has your contact details and can respond through AeroTrade. The opportunity remains recorded so it can be followed up if it is unattended.</p>
      ${buyerPortalUrl ? `<p><a href="${escapeHtml(buyerPortalUrl)}">Open your private enquiry status and negotiation history</a>. This private link expires after 90 days.</p>` : ''}
      <p><a href="${escapeHtml(listingUrl)}">Return to the listing</a></p>`,
  }
}
