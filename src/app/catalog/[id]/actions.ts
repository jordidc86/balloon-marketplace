'use server'

import { createClient } from '@/utils/supabase/server'

export async function logContactReveal(listingId: string) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('User must be logged in to track intent')
  }

  const { error } = await supabase
    .from('listing_events')
    .insert({
      listing_id: listingId,
      user_id: user.id,
      event_type: 'contact_reveal'
    })

  if (error) {
    console.error('Failed to log contact reveal:', error)
    throw new Error('Failed to log event')
  }

  return true
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
    .select('seller_id')
    .eq('id', listingId)
    .single()

  if (fetchError || !listing || listing.seller_id !== user.id) {
    throw new Error('Unauthorized')
  }

  const category = formData.get('category') as string
  const details: any = {}
  
  // Extract common details based on category
  if (['complete', 'envelopes'].includes(category)) {
    details.manufacturer = formData.get('manufacturer')
    details.model = formData.get('model')
    details.year = formData.get('year')
    details.hours = formData.get('hours')
    details.registration = formData.get('registration')
    details.serial = formData.get('serial')
  }

  if (category === 'baskets' || category === 'burners') {
    details.dimensions = formData.get('dimensions')
    details.type = formData.get('type')
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
  const imageUrlsJson = formData.get('image_urls') as string
  if (imageUrlsJson) {
    const imageUrls = JSON.parse(imageUrlsJson) as string[]
    
    const { data: currentImages } = await supabase
      .from('images')
      .select('id, url')
      .eq('listing_id', listingId)

    const currentUrls = currentImages?.map(img => img.url) || []
    const urlsToDelete = currentUrls.filter(url => !imageUrls.includes(url))
    
    if (urlsToDelete.length > 0) {
      await supabase
        .from('images')
        .delete()
        .eq('listing_id', listingId)
        .in('url', urlsToDelete)
    }

    const urlsToInsert = imageUrls.filter(url => !currentUrls.includes(url))
    if (urlsToInsert.length > 0) {
      const inserts = urlsToInsert.map((url, index) => ({
        listing_id: listingId,
        url,
        is_primary: index === 0
      }))
      await supabase.from('images').insert(inserts)
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

  if (listing.status !== 'DRAFT') {
    throw new Error('Listing is already active or being processed')
  }

  const { stripe } = await import('@/utils/stripe')
  const headersList = await import('next/headers').then(m => m.headers())
  const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'Listing Fee: ' + listing.title,
            description: '48-hour Premium Exclusive Window + Public Listing',
          },
          unit_amount: 500,
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: 'listing_fee',
      listing_id: listing.id,
      user_id: user.id
    },
    mode: 'payment',
    success_url: `${origin}/catalog/${listing.id}?success=true`,
    cancel_url: `${origin}/catalog/${listing.id}?canceled=true`,
  })

  if (session.url) {
    const { redirect: nextRedirect } = await import('next/navigation')
    nextRedirect(session.url)
  } else {
    throw new Error('Failed to create Stripe session')
  }
}

