'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { sendEmail } from '@/utils/resend'
import { escapeHtml } from '@/utils/html'
import { getListingPlan, premiumListingFeeCents } from '@/utils/listing-plans'
import { getApplicationOrigin } from '@/utils/navigation.mjs'
import { getInitialListingPublication, parseListingImageUrls } from '@/utils/listing-safety.mjs'
import { siteUrl } from '@/utils/site'

export async function submitListing(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const listingPlan = getListingPlan(formData.get('listing_plan'))
  const publication = getInitialListingPublication(listingPlan)
  const imageUrls = parseListingImageUrls(formData.get('image_urls'))

  const category = formData.get('category') as string
  const getTextValue = (name: string) => {
    const value = formData.get(name)
    return typeof value === 'string' ? value : null
  }
  const details: Record<string, string | null> = {}
  
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
    details.type = getTextValue('type') // burner type
  }
  details.listing_plan = listingPlan

  // Generate a random ID for the listing
  const listingData = {
    seller_id: user.id,
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
    status: 'DRAFT',
    public_at: null,
  }

  const { data: listing, error } = await supabase
    .from('listings')
    .insert(listingData)
    .select()
    .single()

  if (error) {
    console.error("Error creating listing:", error)
    throw new Error('Could not create listing')
  }

  const inserts = imageUrls.map((url, index) => ({
    listing_id: listing.id,
    url,
    is_primary: index === 0,
  }))
  const { error: imageError } = await supabase.from('images').insert(inserts)

  if (imageError) {
    console.error("Error saving listing images:", imageError)
    await supabase.from('listings').delete().eq('id', listing.id)
    throw new Error('Could not save listing images')
  }

  const { data: publishedListing, error: publicationError } = await supabase
    .from('listings')
    .update({
      status: publication.status,
      public_at: publication.publicAt,
    })
    .eq('id', listing.id)
    .select()
    .single()

  if (publicationError || !publishedListing) {
    console.error('Error publishing listing:', publicationError)
    await supabase.from('listings').delete().eq('id', listing.id)
    throw new Error('Could not publish listing')
  }

  try {
    await sendEmail(
      'jordi.diaz.casaubon@gmail.com',
      'Nuevo anuncio en AeroTrade',
      `<p>Se ha creado un nuevo anuncio:</p>
      <p>Plan: ${escapeHtml(listingPlan)}</p>
      <p>Título: ${escapeHtml(publishedListing.title)}</p>
      <p>Categoría: ${escapeHtml(publishedListing.category)}</p>
      <p>Precio: ${escapeHtml(publishedListing.price)}</p>
      <p>Usuario ID: ${escapeHtml(user.id)}</p>
      <p>Email contacto: ${escapeHtml(publishedListing.contact_email)}</p>
      <p>Status: ${escapeHtml(publishedListing.status)}</p>`
    )
  } catch (e) {
    console.error("Error sending notification:", e)
  }

  if (listingPlan === 'free') {
    redirect(`/catalog/${publishedListing.id}?success=true&plan=free`)
  }

  // Use Stripe to charge the 5 EUR Premium listing fee.
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
            name: 'Premium Listing: ' + publishedListing.title,
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
      listing_id: publishedListing.id,
      user_id: user.id
    },
    mode: 'payment',
    success_url: `${origin}/catalog/${publishedListing.id}?success=true`,
    cancel_url: `${origin}/catalog/${publishedListing.id}?canceled=true`,
  }, {
    idempotencyKey: `listing-fee-${publishedListing.id}-${Math.floor(Date.now() / 600000)}`,
  })

  // Redirect to Stripe Checkout
  if (session.url) {
    redirect(session.url)
  } else {
    throw new Error('Failed to create Stripe session')
  }
}
