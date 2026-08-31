import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getAllowedListingImageHosts,
  listingImageObservations,
  probeListingImages,
} from '@/utils/listing-image-quality.mjs'

const getProbeOptions = () => {
  const allowedHostnames = getAllowedListingImageHosts(process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (allowedHostnames.length === 0) throw new Error('Listing image storage is not configured')
  return { allowedHostnames }
}

export async function assessListingImageUrls(urls: string[]) {
  return probeListingImages(urls, getProbeOptions())
}

export async function assertListingImageUrlsReachable(urls: string[]) {
  const assessment = await assessListingImageUrls(urls)
  if (assessment.observation !== listingImageObservations.AVAILABLE) {
    throw new Error(
      assessment.observation === listingImageObservations.DEFINITELY_MISSING
        ? 'At least one uploaded image must be available before this listing can be published'
        : 'We could not safely verify the listing image. Please try again before publishing',
    )
  }
  return assessment
}

export async function assertListingHasReachableImage(supabase: SupabaseClient, listingId: string) {
  const { data: images, error } = await supabase
    .from('images')
    .select('id,url,is_primary')
    .eq('listing_id', listingId)

  if (error) throw new Error('Listing images could not be verified')
  const assessment = await assertListingImageUrlsReachable((images || []).map((image) => image.url))
  if (assessment.reachableUrl) {
    await ensureReachableListingPrimaryImage(supabase, listingId, images || [], assessment.reachableUrl)
  }
  return assessment
}

export async function ensureReachableListingPrimaryImage(
  supabase: SupabaseClient,
  listingId: string,
  images: Array<{ id: string; url: string; is_primary?: boolean | null }>,
  reachableUrl: string,
) {
  const target = images.find((image) => image.url === reachableUrl)
  if (!target) throw new Error('Reachable listing image could not be identified')
  const currentPrimary = images.find((image) => image.is_primary)
  if (currentPrimary?.id === target.id) return false

  const { error: clearError } = await supabase
    .from('images')
    .update({ is_primary: false })
    .eq('listing_id', listingId)
  if (clearError) throw new Error('Listing image cover could not be repaired')

  const { error: setError } = await supabase
    .from('images')
    .update({ is_primary: true })
    .eq('id', target.id)
    .eq('listing_id', listingId)
  if (setError) {
    if (currentPrimary) await supabase.from('images').update({ is_primary: true }).eq('id', currentPrimary.id).eq('listing_id', listingId)
    throw new Error('Listing image cover could not be repaired')
  }

  const { data: readback, error: readbackError } = await supabase
    .from('images')
    .select('id,is_primary')
    .eq('listing_id', listingId)
  const primaryIds = (readback || []).filter((image) => image.is_primary).map((image) => image.id)
  if (readbackError || primaryIds.length !== 1 || primaryIds[0] !== target.id) {
    if (currentPrimary) {
      await supabase.from('images').update({ is_primary: false }).eq('listing_id', listingId)
      await supabase.from('images').update({ is_primary: true }).eq('id', currentPrimary.id).eq('listing_id', listingId)
    }
    throw new Error('Listing image cover repair was not verified')
  }
  return true
}

export async function markListingQualityResolved(supabase: SupabaseClient, listingId: string) {
  const { data: current, error: currentError } = await supabase
    .from('listing_quality_state')
    .select('listing_id,status')
    .eq('listing_id', listingId)
    .maybeSingle()

  if (currentError) throw new Error('Listing quality state could not be read')
  if (!current || current.status === 'RESOLVED' || current.status === 'HEALTHY') return false

  const now = new Date().toISOString()
  const { data: resolved, error } = await supabase
    .from('listing_quality_state')
    .update({
      status: 'RESOLVED',
      last_observation: 'AVAILABLE',
      consecutive_failures: 0,
      last_checked_at: now,
      resolved_at: now,
    })
    .eq('listing_id', listingId)
    .select('listing_id,status')
    .single()

  if (error || resolved?.status !== 'RESOLVED') throw new Error('Listing repair could not be recorded')
  return true
}
