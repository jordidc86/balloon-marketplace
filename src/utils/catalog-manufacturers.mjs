export const minimumManufacturerInventoryForIndexing = 2

export const catalogManufacturers = [
  {
    slug: 'cameron',
    name: 'Cameron Balloons',
    heading: 'Used Cameron hot air balloons for sale',
    description: 'Browse currently available used Cameron hot air balloons and equipment on AeroTrade, compare condition and location, or ask for help finding a different Cameron aircraft.',
    aliases: ['cameron', 'cameron balloons', 'cameron balloons ltd'],
  },
  {
    slug: 'kubicek',
    name: 'Kubicek Balloons',
    heading: 'Used Kubicek hot air balloons for sale',
    description: 'Browse currently available used Kubicek hot air balloons and equipment on AeroTrade, compare condition and location, or record the Kubicek configuration you still need.',
    aliases: ['kubicek', 'kubicek balloons'],
  },
  {
    slug: 'ultramagic',
    name: 'Ultramagic',
    heading: 'Used Ultramagic hot air balloons for sale',
    description: 'Browse currently available used Ultramagic hot air balloons and equipment on AeroTrade, compare condition and location, or ask AeroTrade to source another option.',
    aliases: ['ultramagic', 'ultramagic balloons', 'um'],
  },
]

const normalizedWords = (value) => typeof value === 'string'
  ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  : ''

export function getCatalogManufacturer(value) {
  if (typeof value !== 'string') return null
  const slug = value.trim().toLowerCase()
  return catalogManufacturers.find((manufacturer) => manufacturer.slug === slug) || null
}

export const getCatalogManufacturerPath = (slug) => `/catalog/manufacturer/${encodeURIComponent(slug)}`

export function listingMatchesCatalogManufacturer(listing, manufacturerOrSlug) {
  const manufacturer = typeof manufacturerOrSlug === 'string'
    ? getCatalogManufacturer(manufacturerOrSlug)
    : manufacturerOrSlug
  if (!manufacturer || !listing) return false

  const declared = normalizedWords(listing.details?.manufacturer)
  const title = normalizedWords(listing.title)
  return manufacturer.aliases.some((alias) => {
    const normalizedAlias = normalizedWords(alias)
    return declared === normalizedAlias
      || declared.startsWith(`${normalizedAlias} `)
      || (!declared && (title === normalizedAlias || title.startsWith(`${normalizedAlias} `)))
  })
}

export function getCatalogManufacturersWithInventory(listings = [], minimum = 1) {
  return catalogManufacturers.filter((manufacturer) => (
    listings.filter((listing) => listingMatchesCatalogManufacturer(listing, manufacturer)).length >= minimum
  ))
}
