import { isKnownNewBalloonQuoteAbuse, normalizeNewBalloonQuoteIdentity } from './new-balloon-request.mjs'

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;')

const requestFields = [
  'name', 'email', 'phone', 'country', 'manufacturer_preference', 'equipment_type',
  'volume_or_capacity', 'intended_use', 'budget_range', 'timeline', 'colors_or_branding',
  'notes', 'source_context', 'requested_category', 'requested_equipment', 'requested_country',
]

// These are content signals for an administrator, never proof of identity or a storage/dispatch gate.
// Country, email provider, language and an unspecified budget do not increase the risk.
export function assessNewBalloonQuote(request) {
  const normalize = normalizeNewBalloonQuoteIdentity
  const branding = normalize(request?.colors_or_branding)
  const notes = normalize(request?.notes)
  const description = [branding, notes, normalize(request?.requested_equipment)].join(' ')
  const reasons = []
  const knownCampaign = isKnownNewBalloonQuoteAbuse(request)
  const dealership = /автосалон|car dealership|concesionario de (?:coches|veh[ií]culos)|stand de autom[oó]veis/iu.test(description)
  const carSales = /предлага[ею]|под заказ|привоз|трейд.?ин|import|for sale|offers? (?:cars|vehicles)|venta|vend[ae]/iu.test(description)
  const balloonContext = /balloon|schr[oö]der|schroeder|pasha|ultramagic|cameron|kub[ií][cč]ek|globo|montgolfi|a[eé]rostat|воздушн\S*\s+шар|аэростат/iu.test(description)
  const unrelatedCarAdvertisement = dealership && carSales && !balloonContext
  const repeatedDescription = branding.length >= 80 && branding === notes

  if (knownCampaign) reasons.push('Coincide con una campaña de spam ya identificada en AeroTrade.')
  if (unrelatedCarAdvertisement) reasons.push('El texto promociona la venta o importación de coches y no describe una necesidad de globos o material aeronáutico.')
  if (repeatedDescription) reasons.push('El mismo texto largo aparece en «colores o marca» y en «observaciones».')

  const hasDetails = [request?.volume_or_capacity, request?.requested_equipment, branding, notes]
    .some(value => String(value || '').trim().length > 0)
  if (!hasDetails) reasons.push('Faltan detalles de capacidad, configuración o necesidad concreta; conviene pedirlos antes de preparar un presupuesto.')

  const level = knownCampaign || unrelatedCarAdvertisement ? 'likely_spam'
    : reasons.length ? 'needs_review' : 'no_clear_signals'
  return {
    level,
    label: { likely_spam: 'Probable spam', needs_review: 'Revisar', no_clear_signals: 'Sin señales claras de spam' }[level],
    reasons,
    recommendation: level === 'likely_spam'
      ? 'Revisa el contenido antes de responder. Si confirmas que es publicidad, cierra la solicitud para detener sus recordatorios.'
      : level === 'needs_review'
        ? 'Revisa la petición y confirma con el interesado los datos que falten.'
        : 'Revisa los datos y confirma la necesidad con el interesado antes de preparar una propuesta.',
  }
}

export function buildNewBalloonQuoteAdminNotification({ request, publicSiteUrl, reminder = false }) {
  const assessment = assessNewBalloonQuote(request)
  const color = assessment.level === 'likely_spam' ? '#991b1b' : assessment.level === 'needs_review' ? '#92400e' : '#334155'
  const reasons = assessment.reasons.length
    ? `<ul>${assessment.reasons.map(reason => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>`
    : '<p>No se han detectado las señales de spam que comprueba este filtro.</p>'
  const rows = requestFields.map(key => `<tr>
    <td style="padding: 8px 12px; color: #64748b; text-transform: capitalize;">${escapeHtml(key.replaceAll('_', ' '))}</td>
    <td style="padding: 8px 12px; color: #0f172a; font-weight: 600;">${escapeHtml(request?.[key] || '-')}</td>
  </tr>`).join('')
  const pipelineUrl = `${String(publicSiteUrl || '').replace(/\/$/, '')}/admin/commercial`
  return {
    subject: reminder ? 'AeroTrade: new-balloon quote awaiting action'
      : `New Pasha/Schroeder balloon quote request: ${String(request?.name || '').replace(/[\r\n]/g, ' ')}`,
    assessment,
    html: `<h2>${reminder ? 'A new-balloon opportunity is still open' : 'New AeroTrade balloon quote request'}</h2>
      <section lang="es" style="border: 1px solid #cbd5e1; border-left: 4px solid ${color}; padding: 16px; margin: 16px 0;">
        <h3 style="color: ${color}; margin-top: 0;">Valoración orientativa: ${escapeHtml(assessment.label)}</h3>
        ${reasons}<p>${escapeHtml(assessment.recommendation)}</p>
        <p style="font-size: 13px; color: #64748b;">Comprobación automática del contenido. No verifica la identidad ni confirma que la petición sea legítima. La solicitud no se cierra automáticamente.</p>
      </section>
      <p>${reminder ? 'This new-balloon quote request has remained in NEW status for more than 24 hours.' : 'A request for a new Pasha or Schroeder balloon or equipment has been recorded.'}</p>
      <p><a href="${escapeHtml(pipelineUrl)}">Revisar la solicitud en AeroTrade</a></p>
      <table style="border-collapse: collapse; width: 100%; max-width: 720px;">${rows}</table>`,
  }
}
