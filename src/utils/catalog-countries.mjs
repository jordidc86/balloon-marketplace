export const minimumCountryInventoryForIndexing = 2

export const catalogCountries = [
  {
    slug: 'spain',
    name: 'Spain',
    heading: 'Used hot air balloons and equipment for sale in Spain',
    description: 'Browse used hot air balloons and equipment currently located in Spain, compare aircraft details, or ask AeroTrade to source a different used or factory-new option.',
    inventoryValues: ['Spain'],
  },
  {
    slug: 'belgium',
    name: 'Belgium',
    heading: 'Used hot air balloons and equipment for sale in Belgium',
    description: 'Browse used hot air balloons and equipment currently located in Belgium, compare condition and price, or ask AeroTrade to source another option.',
    inventoryValues: ['Belgium'],
  },
  {
    slug: 'czech-republic',
    name: 'Czech Republic',
    heading: 'Used hot air balloons and equipment for sale in the Czech Republic',
    description: 'Browse used hot air balloons and equipment currently located in the Czech Republic, compare available aircraft, or record the configuration you still need.',
    inventoryValues: ['Czech Republic', 'Czechia'],
  },
  {
    slug: 'turkey',
    name: 'Türkiye',
    heading: 'Used hot air balloons and equipment for sale in Türkiye',
    description: 'Browse used hot air balloons and equipment currently located in Türkiye, compare active inventory, or ask AeroTrade to source another used or factory-new option.',
    inventoryValues: ['Türkiye', 'Turkey'],
  },
]

const normalizeCountry = (value) => typeof value === 'string'
  ? value.trim().toLowerCase().replace(/\s+/g, ' ')
  : ''

export function getCatalogCountry(value) {
  if (typeof value !== 'string') return null
  const slug = value.trim().toLowerCase()
  return catalogCountries.find((country) => country.slug === slug) || null
}

export const getCatalogCountryPath = (slug) => `/catalog/country/${encodeURIComponent(slug)}`

export function listingMatchesCatalogCountry(listing, countryOrSlug) {
  const country = typeof countryOrSlug === 'string' ? getCatalogCountry(countryOrSlug) : countryOrSlug
  if (!country || !listing) return false
  const listedCountry = normalizeCountry(listing.location_country)
  return country.inventoryValues.some((value) => normalizeCountry(value) === listedCountry)
}

export function getCatalogCountriesWithInventory(listings = [], minimum = 1) {
  return catalogCountries.filter((country) => (
    listings.filter((listing) => listingMatchesCatalogCountry(listing, country)).length >= minimum
  ))
}
