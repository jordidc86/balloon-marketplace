const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;')

export function buildSellerAvailabilityDigestNotification({ dueListings, capabilityUrl, dashboardUrl }) {
  if (!Array.isArray(dueListings) || dueListings.length < 1 || dueListings.length > 100) {
    throw new Error('Seller availability digest requires bounded listing evidence')
  }
  const listingItems = dueListings.map((listing) => `<li>${escapeHtml(listing.title)}</li>`).join('')
  const count = dueListings.length
  return {
    subject: `Please confirm your ${count} active AeroTrade listing${count === 1 ? '' : 's'}`,
    html: `<p>You have ${count} active AeroTrade advert${count === 1 ? '' : 's'} without a recent owner availability confirmation:</p><ul>${listingItems}</ul><p><a href="${escapeHtml(capabilityUrl)}"><strong>Review and confirm these listings</strong></a></p><p>The private link is valid for 14 days and opens a review page. Nothing is confirmed merely by opening it: you must press the explicit confirmation button.</p><p>You can also sign in and use <strong>Confirm all active listings available</strong> in <a href="${escapeHtml(dashboardUrl)}">your AeroTrade dashboard</a>.</p><p>This request does not change publication, price, ownership or payment. AeroTrade records one dated confirmation for each advert only after your explicit action.</p>`,
  }
}
