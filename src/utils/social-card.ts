import type { SupabaseClient } from '@supabase/supabase-js'

export type SocialCardListing = {
  id: string
  title: string
  price: number
  currency: string
  condition?: string | null
  category?: string | null
  details?: {
    hours?: string | number
    manufacturer?: string
    year?: string | number
    model?: string
  } | null
  images?: { url: string; is_primary?: boolean | null; created_at?: string | null }[] | null
}

export const socialCardSize = {
  width: 1080,
  height: 1080,
}

export const socialStorySize = {
  width: 1080,
  height: 1920,
}

export const getSocialCardUrl = (siteUrl: string, listingId: string, format: 'post' | 'story' = 'post') => {
  const baseUrl = `${siteUrl.replace(/\/$/, '')}/api/social-card/${listingId}`
  return format === 'story' ? `${baseUrl}?format=story` : baseUrl
}

export const getPrimaryImageUrl = (listing: Pick<SocialCardListing, 'images'>) => {
  const images = [...(listing.images || [])].sort((a, b) => {
    if (a.is_primary && !b.is_primary) return -1
    if (!a.is_primary && b.is_primary) return 1
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
  })

  return images[0]?.url || null
}

export const formatSocialCardPrice = (listing: Pick<SocialCardListing, 'price' | 'currency'>) => {
  if (Number(listing.price) <= 0) {
    return 'Price on request'
  }

  return `${Number(listing.price).toLocaleString('de-DE')} ${listing.currency}`
}

export const getSocialCardFacts = (listing: SocialCardListing) => {
  const details = listing.details || {}

  return {
    hours: details.hours ? String(details.hours) : null,
    condition: listing.condition || 'Used',
  }
}

export const fetchListingForSocialCard = async (
  supabase: SupabaseClient,
  listingId: string
) => {
  const { data, error } = await supabase
    .from('listings')
    .select('id,title,price,currency,condition,category,details,images(url,is_primary,created_at)')
    .eq('id', listingId)
    .single()

  if (error) {
    throw error
  }

  return data as SocialCardListing
}
