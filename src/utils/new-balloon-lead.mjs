export const newBalloonLeadSources = ['direct', 'navigation', 'home', 'catalog', 'catalog-empty', 'listing', 'wanted']

export function normalizeNewBalloonLeadSource(value) {
  if (typeof value !== 'string') return 'direct'
  const normalized = value.trim().toLowerCase()
  return newBalloonLeadSources.includes(normalized) ? normalized : 'direct'
}
