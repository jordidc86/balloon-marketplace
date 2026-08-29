const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

export function buildNewBalloonBuyerAcknowledgement(request, publicSiteUrl) {
  const manufacturerLabel = request.manufacturer_preference === 'advice'
    ? 'a new Pasha or Schroeder balloon'
    : `a new ${request.manufacturer_preference === 'pasha' ? 'Pasha' : 'Schroeder'} balloon`
  const equipmentLabel = String(request.equipment_type || 'balloon').replaceAll('-', ' ')
  const site = String(publicSiteUrl || '').replace(/\/$/, '')
  return {
    subject: 'AeroTrade received your new-balloon request',
    html: `<h2>Your request is safely recorded</h2>
      <p>AeroTrade received your request for <strong>${escapeHtml(manufacturerLabel)}</strong> with the equipment scope <strong>${escapeHtml(equipmentLabel)}</strong>.</p>
      <p>We will review the intended use, capacity, operating country and timing you supplied, then contact you if a detail is needed before preparing an indicative direction.</p>
      <p>Any initial configuration or budget range is non-binding. It is not a factory order, does not reserve production and creates no payment obligation.</p>
      <p><a href="${escapeHtml(`${site}/new-balloon`)}">Review AeroTrade's new-balloon service</a>.</p>`,
  }
}
