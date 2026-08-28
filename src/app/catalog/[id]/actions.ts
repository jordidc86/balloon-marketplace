'use server'

import { createClient } from '@/utils/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getStoredListingPlan, premiumListingFeeCents } from '@/utils/listing-plans'
import { getApplicationOrigin } from '@/utils/navigation.mjs'
import { canRevealSellerContact, parseListingImageUrls } from '@/utils/listing-safety.mjs'
import { siteUrl } from '@/utils/site'

type ListingDetailsForm = Record<string, string | number | boolean | null | undefined>

const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Server configuration error')
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey)
}

export async function logListingView(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const supabaseAdmin = createAdminClient()
  const { data: listing, error: listingError } = await supabaseAdmin
    .from('listings')
    .select('id,status')
    .eq('id', listingId)
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
    .maybeSingle()

  if (listingError || !listing) return false
  const { error } = await supabaseAdmin.from('listing_events').insert({
    listing_id: listing.id,
    user_id: user?.id || null,
    event_type: 'VIEW',
  })
  if (error) {
    console.error('Failed to log listing view:', error)
    return false
  }
  return true
}

export async function revealSellerContact(listingId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase
      .from('users')
      .select('is_premium')
      .eq('id', user.id)
      .single()
    : { data: null }

  const supabaseAdmin = createAdminClient()
  const { data: listing, error } = await supabaseAdmin
    .from('listings')
    .select('id, seller_id, status, public_at, contact_email, contact_phone')
    .eq('id', listingId)
    .single()

  if (error || !listing) {
    throw new Error('Listing not found')
  }

  const canReveal = canRevealSellerContact(
    {
      status: listing.status,
      publicAt: listing.public_at,
      sellerId: listing.seller_id,
    },
    {
      userId: user?.id || null,
      isPremium: profile?.is_premium || false,
    },
  )

  if (!canReveal) {
    throw new Error('Premium access is required to reveal this contact')
  }

  const { error: eventError } = await supabaseAdmin
    .from('listing_events')
    .insert({
      listing_id: listingId,
      user_id: user?.id || null,
      event_type: 'CONTACT_REVEAL',
    })

  if (eventError) {
    console.error('Failed to log contact reveal:', eventError)
  }

  return {
    email: listing.contact_email as string,
    phone: listing.contact_phone as string | null,
  }
}

export async function updateListing(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const listingId = formData.get('id') as string;
  if (!listingId) {
    throw new Error('Listing ID required')
  }

  // Verify ownership
  const { data: listing, error: fetchError } = await supabase
    .from('listings')
    .select('seller_id, details')
    .eq('id', listingId)
    .single()

  if (fetchError || !listing || listing.seller_id !== user.id) {
    throw new Error('Unauthorized')
  }

  const category = formData.get('category') as string
  const getTextValue = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value : null
  }
  const details: ListingDetailsForm = {
    ...((listing.details || {}) as ListingDetailsForm),
  }
  
  // Extract common details based on category
  if (['complete', 'envelopes'].includes(category)) {
    details.manufacturer = getTextValue('manufacturer')
    details.model = getTextValue('model')
    details.year = getTextValue('year')
    details.hours = getTextValue('hours')
    details.registration = getTextValue('registration')
    details.serial = getTextValue('serial')
  }

  if (category === 'baskets' || category === 'burners' || category === 'bottom-end') {
    details.dimensions = getTextValue('dimensions')
    details.type = getTextValue('type')
  }

  const storedPlan = getStoredListingPlan(listing.details)
  if (storedPlan) {
    details.listing_plan = storedPlan
  }

  const listingData = {
    category,
    title: formData.get('title') as string,
    description: formData.get('description') as string,
    price: parseFloat(formData.get('price') as string),
    currency: formData.get('currency') as string,
    condition: formData.get('condition') as string,
    location_country: formData.get('location_country') as string,
    contact_email: formData.get('contact_email') as string,
    contact_phone: formData.get('contact_phone') as string,
    details,
  }

  const { error: updateError } = await supabase
    .from('listings')
    .update(listingData)
    .eq('id', listingId)

  if (updateError) {
    console.error("Error updating listing:", updateError)
    throw new Error('Could not update listing')
  }

  // Handle Images Reconciliation
  const imageUrlsJson = formData.get('image_urls')
  if (imageUrlsJson) {
    const imageUrls = parseListingImageUrls(imageUrlsJson)
    
    const { data: currentImages } = await supabase
      .from('images')
      .select('id, url')
      .eq('listing_id', listingId)

    const currentUrls = currentImages?.map(img => img.url) || []
    const urlsToInsert = imageUrls.filter(url => !currentUrls.includes(url))
    if (urlsToInsert.length > 0) {
      const inserts = urlsToInsert.map((url, index) => ({
        listing_id: listingId,
        url,
        is_primary: currentUrls.length === 0 && index === 0
      }))
      const { error: insertError } = await supabase.from('images').insert(inserts)
      if (insertError) {
        console.error('Error adding listing images:', insertError)
        throw new Error('Could not add listing images')
      }
    }

    const urlsToDelete = currentUrls.filter(url => !imageUrls.includes(url))
    if (urlsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('images')
        .delete()
        .eq('listing_id', listingId)
        .in('url', urlsToDelete)

      if (deleteError) {
        console.error('Error removing listing images:', deleteError)
        throw new Error('Could not remove listing images')
      }
    }

    const { data: remainingImages, error: remainingImagesError } = await supabase
      .from('images')
      .select('id, is_primary, created_at')
      .eq('listing_id', listingId)
      .order('created_at', { ascending: true })

    if (remainingImagesError || !remainingImages?.length) {
      console.error('Error validating listing images:', remainingImagesError)
      throw new Error('A cover image is required to publish a listing')
    }

    if (!remainingImages.some((image) => image.is_primary)) {
      const { error: primaryError } = await supabase
        .from('images')
        .update({ is_primary: true })
        .eq('id', remainingImages[0].id)

      if (primaryError) {
        console.error('Error assigning primary listing image:', primaryError)
        throw new Error('Could not assign the cover image')
      }
    }
  }

  const { revalidatePath } = await import('next/cache')
  revalidatePath(`/catalog/${listingId}`)
  revalidatePath(`/dashboard`)
  
  const { redirect: nextRedirect } = await import('next/navigation')
  nextRedirect(`/catalog/${listingId}?updated=true`)
}

export async function payListingFee(listingId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: listing, error } = await supabase
    .from('listings')
    .select('id, title, seller_id, status')
    .eq('id', listingId)
    .single()

  if (error || !listing || listing.seller_id !== user.id) {
    throw new Error('Unauthorized')
  }

  if (listing.status !== 'DRAFT' && listing.status !== 'PENDING_PAYMENT') {
    throw new Error('Listing is already active or being processed')
  }

  const { stripe } = await import('@/utils/stripe')
  const headersList = await import('next/headers').then(m => m.headers())
  const origin = getApplicationOrigin(headersList.get('origin'), siteUrl)

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Premium Listing: ' + listing.title,
            description: '48-hour Premium window, bi-weekly newsletter, social promotion and buyer outreach.',
          },
          unit_amount: premiumListingFeeCents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: 'listing_fee',
      listing_plan: 'premium',
      listing_id: listing.id,
      user_id: user.id
    },
    mode: 'payment',
    success_url: `${origin}/catalog/${listing.id}?success=true`,
    cancel_url: `${origin}/catalog/${listing.id}?canceled=true`,
  }, {
    idempotencyKey: `listing-fee-${listing.id}-${Math.floor(Date.now() / 600000)}`,
  })

  if (session.url) {
    const { redirect: nextRedirect } = await import('next/navigation')
    nextRedirect(session.url)
  } else {
    throw new Error('Failed to create Stripe session')
  }
}

export async function publishListingFree(listingId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: listing, error } = await supabase
    .from('listings')
    .select('id, seller_id, status, details')
    .eq('id', listingId)
    .single()

  if (error || !listing || listing.seller_id !== user.id) {
    throw new Error('Unauthorized')
  }

  if (listing.status !== 'DRAFT' && listing.status !== 'PENDING_PAYMENT') {
    throw new Error('Listing is already active')
  }

  const details = {
    ...((listing.details || {}) as Record<string, unknown>),
    listing_plan: 'free',
  }

  const { error: updateError } = await supabase
    .from('listings')
    .update({
      status: 'ACTIVE_PUBLIC',
      public_at: new Date().toISOString(),
      details,
    })
    .eq('id', listingId)

  if (updateError) {
    console.error('Error publishing listing as free:', updateError)
    throw new Error('Could not publish listing')
  }

  const { revalidatePath } = await import('next/cache')
  revalidatePath(`/catalog/${listingId}`)
  revalidatePath('/catalog')
  revalidatePath('/dashboard')

  const { redirect: nextRedirect } = await import('next/navigation')
  nextRedirect(`/catalog/${listingId}?success=true&plan=free`)
}
