export type ListingPlan = 'free' | 'premium'

type DetailsWithPlan = {
  listing_plan?: unknown
}

export const premiumListingFeeCents = 500
export const premiumListingFeeLabel = '5 EUR'

export function getListingPlan(value: FormDataEntryValue | string | null): ListingPlan {
  return value === 'premium' ? 'premium' : 'free'
}

export function getStoredListingPlan(details: DetailsWithPlan | null | undefined): ListingPlan | null {
  if (details?.listing_plan === 'free' || details?.listing_plan === 'premium') {
    return details.listing_plan
  }

  return null
}

export function isPromotedListing(details: DetailsWithPlan | null | undefined) {
  return getStoredListingPlan(details) !== 'free'
}
