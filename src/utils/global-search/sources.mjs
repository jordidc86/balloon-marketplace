// Public catalogue pages only. No seller contact data, account pages or arbitrary URLs.
export const GLOBAL_SEARCH_SOURCES = [
  { id: 'balloons4sale', name: 'Balloons4sale.eu', origin: 'https://www.balloons4sale.eu', path: '/complete', coverage: 'Balloon and equipment category pages', pages: ['complete', 'envelopes', 'bottomends', 'baskets', 'burners', 'tanks', 'fans', 'vehicles', 'trailers', 'instruments', 'other'].map(c => `/${c}`), listingPath: '^/article/\\d+/' },
  { id: 'zebedee', name: 'The Zebedee List', origin: 'https://www.zebedeelist.co.uk', path: '/list/complete-balloons/', coverage: 'First page of 11 balloon and equipment categories', pages: ['complete-balloons', 'envelopes', 'bottom-ends', 'baskets', 'burners', 'burner-frames', 'tanks', 'fans', 'instruments', 'trailers', 'other'].map(c => `/list/${c}/`), listingPath: '^/zebedee_list/[^/]+/?$' },
  { id: 'secondhand', name: 'SecondHand Balloons', origin: 'https://www.secondhandballoons.com', path: '/', coverage: 'First page of 10 balloon and equipment categories', pages: ['complete-balloons', 'envelopes', 'baskets', 'burners-frames', 'fuel-system', 'inflation-equipment', 'instruments-avionics', 'accessories-spare-parts', 'trailers-transport', 'other'].map(c => `/classified-category/${c}/`), listingPath: '^/ad/[^/]+/?$' },
  { id: 'swapballoon', name: 'SwapBalloon', origin: 'https://swapballoon.com', path: '/shop/last-added/', coverage: 'Latest additions page; older adverts may not appear', pages: ['/shop/last-added/'], listingPath: '^/4sale/[^/]+/?$' },
  { id: 'barnstormers', name: 'Barnstormers', origin: 'https://www.barnstormers.com', path: '/category-20502-Lighter-Than-Air.html', coverage: 'First page of Lighter-Than-Air classifieds', pages: ['/category-20502-Lighter-Than-Air.html'], listingPath: '^/classified-\\d+-[^/]+\\.html$' },
]

export function getGlobalSearchSource(id) {
  return GLOBAL_SEARCH_SOURCES.find(source => source.id === id)
}

export function safeListingUrl(href, source) {
  try {
    const url = new URL(href, source.origin)
    if (url.origin !== source.origin || url.username || url.password || !new RegExp(source.listingPath).test(url.pathname)) return null
    url.search = ''
    url.hash = ''
    return url.href
  } catch { return null }
}

export function safeThumbnailUrl(href, source) {
  if (!href) return null
  try {
    const url = new URL(href, source.origin)
    const ownImage = url.origin === source.origin && (source.id === 'balloons4sale' ? url.pathname.startsWith('/article_photos/') : url.pathname.startsWith('/wp-content/uploads/'))
    const barnstormersImage = source.id === 'barnstormers' && url.origin === 'https://barnstormers.s3.amazonaws.com' && url.pathname.startsWith('/media/listing_images/thumbnail/')
    if ((!ownImage && !barnstormersImage) || url.username || url.password || !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null
    url.search = ''; url.hash = ''
    return url.href
  } catch { return null }
}

export function normalizeSearchText(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/(\w)-(?=\w)/g, '$1').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

const countryNames = new Map()
const regions = new Intl.DisplayNames(['en'], { type: 'region' })
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a, b)
  const name = regions.of(code)
  if (name && name !== code) countryNames.set(normalizeSearchText(name), name)
}
for (const [alias, name] of [['UK', 'United Kingdom'], ['USA', 'United States'], ['Czech Republic', 'Czechia'], ['Turkey', 'Türkiye']]) { countryNames.set(normalizeSearchText(alias), name); countryNames.set(normalizeSearchText(name), name) }

export function canonicalCountry(value) {
  return countryNames.get(normalizeSearchText(value)) || null
}

export function filterGlobalListings(listings, query, portal = 'all') {
  const words = normalizeSearchText(String(query || '').slice(0, 100)).split(' ').filter(Boolean)
  return listings.filter(item => (portal === 'all' || item.sourceId === portal) && words.every(word => normalizeSearchText(item.title + ' ' + (item.registration || '')).includes(word)))
    .sort((a, b) => a.title.localeCompare(b.title) || a.sourceId.localeCompare(b.sourceId))
}

// Only flag a possible match. The same registration can refer to a complete balloon
// or an envelope, so never silently merge or discard different advertisements.
export function registrationFromText(value) {
  return String(value || '').toUpperCase().match(/\b(?:G-[A-Z]{4}|EC-[A-Z]{3}|PH-[A-Z]{3}|D-O[A-Z]{3}|F-[GH][A-Z]{3}|OO-[A-Z]{3}|HB-[A-Z]{3}|I-[A-Z]{4}|N\d{1,5}[A-Z]{1,2})\b/)?.[0] || null
}
