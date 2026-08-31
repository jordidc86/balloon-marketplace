const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

export function buildInquiryBuyerAcknowledgement({ listingTitle, listingUrl, buyerPortalUrl, indicativeOffer, sellerDeliveryAccepted }) {
  const deliveryCopy = sellerDeliveryAccepted
    ? `<p>We have sent your enquiry about <strong>${escapeHtml(listingTitle)}</strong> to the seller.</p>
      <p>The seller now has your contact details and can respond through AeroTrade. The opportunity remains recorded so it can be followed up if it is unattended.</p>`
    : `<p>We have safely recorded your enquiry about <strong>${escapeHtml(listingTitle)}</strong>, but the seller email has not yet been confirmed as delivered.</p>
      <p>The opportunity remains visible in the seller dashboard and in AeroTrade's recovery queue. We will not claim that the seller received it until delivery is accepted by the email provider.</p>`
  return {
    subject: `AeroTrade received your enquiry about ${listingTitle}`,
    html: `<h2>Your enquiry is safely recorded</h2>
      ${deliveryCopy}
      ${indicativeOffer ? `<p>Your non-binding price indication of <strong>${escapeHtml(indicativeOffer)}</strong> was recorded. It does not reserve the equipment or form a sale contract.</p>` : ''}
      ${buyerPortalUrl ? `<p><a href="${escapeHtml(buyerPortalUrl)}">Open your private enquiry status and negotiation history</a>. This private link expires after 90 days.</p>` : ''}
      <p><a href="${escapeHtml(listingUrl)}">Return to the listing</a></p>`,
  }
}
