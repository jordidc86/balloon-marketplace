'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/utils/supabase/server'
import { getListingAvailabilityState } from '@/utils/listing-availability.mjs'
import { sellerAvailabilityDigestIdempotencyKey } from '@/utils/seller-availability-digest.mjs'
import { verifySellerAvailabilityCapability } from '@/utils/seller-availability-capability.mjs'

export type SellerAvailabilityConfirmationState = { success: boolean; message: string }

const text = (formData: FormData, name: string) => {
  const value = formData.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

export async function submitSellerAvailabilityConfirmation(_state: SellerAvailabilityConfirmationState, formData: FormData): Promise<SellerAvailabilityConfirmationState> {
  const sellerId = text(formData, 'seller_id')
  const digestKey = text(formData, 'digest_key')
  const token = text(formData, 'token')
  if (text(formData, 'availability_confirmation') !== 'yes') {
    return { success: false, message: 'Review the listings and explicitly confirm their current availability.' }
  }

  const admin = await createAdminClient()
  const [{ data: seller, error: sellerError }, { data: receipt, error: receiptError }] = await Promise.all([
    admin.from('users').select('id,email').eq('id', sellerId).maybeSingle(),
    admin
      .from('commercial_notification_receipts')
      .select('id,status,provider_message_id,accepted_at')
      .eq('notification_type', 'seller_availability_digest')
      .eq('entity_type', 'user')
      .eq('entity_id', sellerId)
      .eq('idempotency_key', digestKey)
      .maybeSingle(),
  ])
  const authorized = Boolean(!sellerError && !receiptError && seller?.id && seller.email && receipt?.status === 'accepted' && receipt.provider_message_id
    && verifySellerAvailabilityCapability({
      sellerId: seller.id,
      sellerEmail: seller.email,
      digestKey,
      secret: process.env.SUPABASE_SERVICE_ROLE_KEY,
      token,
    }))
  if (!authorized || !seller) return { success: false, message: 'This private confirmation link is invalid or has expired.' }

  const { data: listingRows, error: listingsError } = await admin
    .from('listings')
    .select('id,status')
    .eq('seller_id', seller.id)
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
    .order('id')
  if (listingsError || !listingRows?.length) return { success: false, message: 'No active seller inventory is available to confirm.' }
  const listingIds = listingRows.map((listing) => listing.id)
  const { data: confirmationRows, error: confirmationsError } = await admin
    .from('listing_availability_confirmations')
    .select('id,listing_id,confirmed_at')
    .in('listing_id', listingIds)
    .order('confirmed_at', { ascending: false })
  if (confirmationsError) return { success: false, message: 'Current availability evidence could not be read.' }

  const latestByListing = new Map<string, { id: string; confirmed_at: string }>()
  for (const confirmation of confirmationRows || []) {
    if (!latestByListing.has(confirmation.listing_id)) latestByListing.set(confirmation.listing_id, confirmation)
  }
  const dueListings = listingRows.filter((listing) => !getListingAvailabilityState(latestByListing.get(listing.id)?.confirmed_at).publiclyFresh)
  if (dueListings.length === 0) return { success: true, message: 'All active listings already have current owner confirmation.' }
  const currentDigestKey = sellerAvailabilityDigestIdempotencyKey(seller.id, dueListings.map((listing) => ({
    listingId: listing.id,
    confirmationId: latestByListing.get(listing.id)?.id || null,
  })))
  if (currentDigestKey !== digestKey) {
    return { success: false, message: 'Your inventory changed after this email was sent. Nothing was confirmed; use the dashboard or the latest request.' }
  }

  const dueListingIds = dueListings.map((listing) => listing.id)
  const { data: confirmationResult, error: confirmationError } = await admin.rpc('confirm_listing_availability_from_seller_digest', {
    p_seller_id: seller.id,
    p_digest_key: digestKey,
    p_listing_ids: dueListingIds,
  })
  const confirmations = Array.isArray(confirmationResult) ? confirmationResult : []
  if (confirmationError || confirmations.length !== dueListingIds.length) {
    return { success: false, message: 'Availability confirmation could not be completed safely. Nothing else was changed.' }
  }
  const confirmationIds = confirmations.map((confirmation) => confirmation.confirmation_id)
  if (new Set(confirmationIds).size !== confirmations.length || new Set(confirmations.map((confirmation) => confirmation.listing_id)).size !== dueListingIds.length) {
    return { success: false, message: 'Availability confirmation returned inconsistent evidence.' }
  }

  const { data: readback, error: readbackError } = await admin
    .from('listing_availability_confirmations')
    .select('id,listing_id,seller_id,confirmed_at,confirmed_on')
    .in('id', confirmationIds)
    .eq('seller_id', seller.id)
  const readbackById = new Map((readback || []).map((confirmation) => [confirmation.id, confirmation]))
  const scope = new Set(dueListingIds)
  const verified = confirmations.every((confirmation) => {
    const stored = readbackById.get(confirmation.confirmation_id)
    return scope.has(confirmation.listing_id)
      && stored?.listing_id === confirmation.listing_id
      && stored?.seller_id === seller.id
      && stored?.confirmed_at === confirmation.confirmed_at
  })
  if (readbackError || readbackById.size !== confirmations.length || !verified) {
    return { success: false, message: 'Availability was processed, but AeroTrade could not verify every evidence record.' }
  }

  revalidatePath('/catalog')
  revalidatePath('/dashboard')
  revalidatePath('/seller/availability')
  for (const listingId of dueListingIds) revalidatePath(`/catalog/${listingId}`)
  return { success: true, message: `${confirmations.length} active advert${confirmations.length === 1 ? '' : 's'} now have dated owner-confirmed availability evidence.` }
}
