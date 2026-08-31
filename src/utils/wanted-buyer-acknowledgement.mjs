const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const categoryLabels = {
  complete: 'a complete balloon',
  envelopes: 'an envelope',
  baskets: 'a basket',
  burners: 'a burner',
  'bottom-end': 'a bottom end',
  cylinders: 'cylinders',
  'other-equipment': 'other balloon equipment',
}

export function buildWantedBuyerAcknowledgement({ category, notifyOnMatch, matchingCount }, publicSiteUrl) {
  const site = String(publicSiteUrl || '').replace(/\/$/, '')
  const categoryLabel = categoryLabels[category] || 'balloon equipment'
  const candidateCount = Number.isInteger(matchingCount) && matchingCount >= 0 ? matchingCount : 0
  const matchCopy = notifyOnMatch
    ? '<p>You asked AeroTrade to email you if suitable equipment is identified. This is an operational match alert only, not consent to marketing campaigns.</p>'
    : '<p>You did not request automatic match alerts. AeroTrade may review the requirement manually, but will not add you to marketing or match-alert emails.</p>'

  return {
    subject: 'AeroTrade received your wanted-equipment request',
    html: `<h2>Your buying requirement is safely recorded</h2>
      <p>AeroTrade received your request for <strong>${escapeHtml(categoryLabel)}</strong>.</p>
      <p>The current catalogue has <strong>${candidateCount}</strong> basic candidate${candidateCount === 1 ? '' : 's'} matching the category, currency and maximum-budget filters you supplied. This count is not a claim that an aircraft is suitable, available or technically compliant.</p>
      ${matchCopy}
      <p><a href="${escapeHtml(`${site}/catalog`)}">Review the current AeroTrade catalogue</a></p>
      <p>If nothing suitable is available used, <a href="${escapeHtml(`${site}/new-balloon?source=wanted`)}">request an indicative budget for a new Pasha or Schroeder balloon</a>.</p>
      <p>This request creates no reservation, purchase contract or payment obligation.</p>`,
  }
}
