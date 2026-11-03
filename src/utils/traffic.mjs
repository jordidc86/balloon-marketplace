const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const publicPages = new Set(['/', '/catalog', '/sell', '/pricing', '/contact', '/wanted', '/about', '/new-balloon', '/new-balloon/schroeder', '/new-balloon/pasha', '/sell/assisted', '/sell-hot-air-balloon', '/used-hot-air-balloons-for-sale', '/es/globos-aerostaticos-segunda-mano', '/fr/montgolfieres-occasion', '/de/gebrauchte-heissluftballons', '/global-search', '/privacy', '/terms'])
export function trafficPath(value) {
  if (typeof value !== 'string' || value.includes('?') || value.includes('#')) return null
  if (publicPages.has(value)) return value
  if (/^\/catalog\/(category|country|manufacturer)\/[a-z0-9-]{1,60}$/.test(value)) return value
  if (/^\/catalog\/[0-9a-f-]{36}$/i.test(value) && uuid.test(value.slice(9))) return value
  return null
}
export function trafficLabel(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]{0,119}$/i.test(value) ? value.toLowerCase() : null
}
export function trafficSource(context = {}) {
  const source = trafficLabel(context.utmSource)
  let host = null
  try { host = new URL(context.referrer).hostname.toLowerCase() } catch {}
  if (host && (host === 'aerotrade.app' || host.endsWith('.netlify.app'))) host = null
  return { source: source || host || 'direct', campaign: trafficLabel(context.utmCampaign) || '', medium: trafficLabel(context.utmMedium) || '' }
}
export function validTrafficEvent(input) {
  return input && uuid.test(input.eventId || '') && trafficPath(input.path) ? { eventId: input.eventId, path: input.path } : null
}
export function trackedSearchUrl(source, placement = 'bio') {
  if (!['instagram', 'facebook', 'whatsapp'].includes(source) || !['bio','post','story','status'].includes(placement)) throw new Error('Invalid campaign destination')
  return `https://aerotrade.app/catalog?utm_source=${source}&utm_medium=organic_social&utm_campaign=integrated_search&utm_content=${placement}`
}
