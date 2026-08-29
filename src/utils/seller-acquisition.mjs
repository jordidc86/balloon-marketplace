export const sellerAcquisitionSources = [
  'direct',
  'navigation',
  'home',
  'dashboard',
  'catalog_empty',
  'seller_seo',
  'sell_gateway',
  'assisted_conversion',
]

export function normalizeSellerAcquisitionSource(value, fallback = 'direct') {
  if (typeof value !== 'string') return fallback
  const normalized = value.trim().toLowerCase().replaceAll('-', '_')
  return sellerAcquisitionSources.includes(normalized) ? normalized : fallback
}
