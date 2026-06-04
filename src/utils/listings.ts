export type ListingImage = {
  url: string
  is_primary?: boolean | null
  created_at?: string | null
}

export type ListingDetails = {
  manufacturer?: string | number | null
  model?: string | number | null
  year?: string | number | null
  hours?: string | number | null
  registration?: string | number | null
  serial?: string | number | null
  dimensions?: string | number | null
  type?: string | number | null
  listing_plan?: 'free' | 'premium' | null
}

export type ListingWithImages = {
  id: string
  seller_id: string
  category: string
  title: string
  description?: string | null
  price: number
  currency: string
  condition: string
  location_country: string
  contact_email?: string | null
  contact_phone?: string | null
  details?: ListingDetails | null
  status: string
  public_at?: string | null
  created_at: string
  updated_at?: string | null
  images?: ListingImage[] | null
}

export type ListingVisibility = {
  isPremiumExclusive: boolean
  isOwner: boolean
  canViewFully: boolean
}

export function getListingVisibility(
  listing: Pick<ListingWithImages, 'seller_id' | 'status' | 'public_at'>,
  userId: string | undefined,
  isPremium: boolean
): ListingVisibility {
  const publicAt = listing.public_at ? new Date(listing.public_at) : null
  const isPremiumExclusive =
    listing.status === 'ACTIVE_PREMIUM' && Boolean(publicAt) && new Date() < publicAt!
  const isOwner = Boolean(userId && userId === listing.seller_id)

  return {
    isPremiumExclusive,
    isOwner,
    canViewFully: !isPremiumExclusive || isPremium || isOwner,
  }
}

export function getPrimaryImageUrl(listing: Pick<ListingWithImages, 'images'>) {
  return listing.images?.find((image) => image.is_primary)?.url || listing.images?.[0]?.url || null
}

export function getPublicTeaserTitle(category: string) {
  const labels: Record<string, string> = {
    complete: 'Complete balloon listing',
    envelopes: 'Envelope listing',
    baskets: 'Basket listing',
    burners: 'Burner listing',
    'bottom-end': 'Bottom end listing',
    cylinders: 'Cylinder listing',
    'other-equipment': 'Equipment listing',
  }

  return labels[category] || 'Premium listing'
}

export function formatListingPrice(price: number, currency: string) {
  if (Number(price) === 0) {
    return 'Inquire for Pricing'
  }

  return `${Number(price).toLocaleString()} ${currency}`
}
