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

// Presentation only: original source/campaign labels remain in the database.
export function trafficChannel(value) {
  const source = String(value || '').toLowerCase().trim()
  if (['facebook','fb','facebook.com','www.facebook.com','m.facebook.com','l.facebook.com','lm.facebook.com'].includes(source)) return 'Facebook'
  if (['instagram','ig','instagram.com','www.instagram.com','l.instagram.com'].includes(source)) return 'Instagram'
  if (['google','google.com','www.google.com'].includes(source)) return 'Google'
  if (['yahoo','search.yahoo.com','es.search.yahoo.com'].includes(source)) return 'Yahoo'
  if (['duckduckgo','duckduckgo.com'].includes(source)) return 'DuckDuckGo'
  if (['chatgpt','chatgpt.com'].includes(source)) return 'ChatGPT'
  if (['newsletter'].includes(source)) return 'Newsletter'
  if (['whatsapp','wa','wa.me','web.whatsapp.com'].includes(source)) return 'WhatsApp'
  if (!source || source === 'direct') return 'Direct / unknown'
  return 'Other / unrecognised'
}
export function trafficChannels(sources = []) {
  const groups = new Map()
  for (const row of sources) {
    const channel = trafficChannel(row.source)
    const group = groups.get(channel) || { channel, visitors: 0, contacts: 0, originals: [] }
    group.visitors += Number(row.visitors)
    group.contacts += Number(row.contacts)
    group.originals.push(row)
    groups.set(channel,group)
  }
  return [...groups.values()].sort((a,b)=>b.visitors-a.visitors || a.channel.localeCompare(b.channel))
}
export function trafficMonths(days = []) {
  const months = new Map()
  for (const {day,report} of days) {
    const month = day.slice(0,7)
    const row = months.get(month) || {month,firstDay:day,lastDay:day,views:0,visitorDays:0,contactVisitors:0,contacts:0,sources:[]}
    row.firstDay = day < row.firstDay ? day : row.firstDay
    row.lastDay = day > row.lastDay ? day : row.lastDay
    for (const key of ['views','visitorDays','contactVisitors','contacts']) row[key] += Number(report[key] || 0)
    row.sources.push(...(report.sources || []))
    months.set(month,row)
  }
  return [...months.values()].sort((a,b)=>b.month.localeCompare(a.month)).map(row=>({...row,channels:trafficChannels(row.sources)}))
}
