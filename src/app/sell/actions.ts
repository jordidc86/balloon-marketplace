'use server'

import { createAdminClient, createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { sendEmail } from '@/utils/resend'
import { sendPremiumListingAlert } from '@/utils/premium-alerts'
import { escapeHtml } from '@/utils/html'
import { getListingPlan, premiumListingFeeCents } from '@/utils/listing-plans'

export async function submitListing(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
  const isPremium = profile?.is_premium || false
  const listingPlan = getListingPlan(formData.get('listing_plan'))
  const shouldStartPremiumWindow = listingPlan === 'premium' && isPremium
  const status = listingPlan === 'free'
    ? 'ACTIVE_PUBLIC'
    : shouldStartPremiumWindow
      ? 'ACTIVE_PREMIUM'
      : 'PENDING_PAYMENT'
  const publicAt = listingPlan === 'free'
    ? new Date().toISOString()
    : shouldStartPremiumWindow
      ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      : null

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
    status,
    public_at: publicAt,
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

  const imageUrlsJson = formData.get('image_urls') as string | null
  if (imageUrlsJson) {
    const imageUrls = JSON.parse(imageUrlsJson) as string[]
    const inserts = imageUrls
      .filter(Boolean)
      .map((url, index) => ({
        listing_id: listing.id,
        url,
        is_primary: index === 0,
      }))

    if (inserts.length > 0) {
      const { error: imageError } = await supabase.from('images').insert(inserts)

      if (imageError) {
        console.error("Error saving listing images:", imageError)
        throw new Error('Could not save listing images')
      }
    }
  }

  try {
    await sendEmail(
      'jordi.diaz.casaubon@gmail.com',
      'Nuevo anuncio en AeroTrade',
      `<p>Se ha creado un nuevo anuncio:</p>
      <p>Plan: ${escapeHtml(listingPlan)}</p>
      <p>Título: ${escapeHtml(listing.title)}</p>
      <p>Categoría: ${escapeHtml(listing.category)}</p>
      <p>Precio: ${escapeHtml(listing.price)}</p>
      <p>Usuario ID: ${escapeHtml(user.id)}</p>
      <p>Email contacto: ${escapeHtml(listing.contact_email)}</p>
      <p>Status: ${escapeHtml(listing.status)}</p>`
    )
  } catch (e) {
    console.error("Error sending notification:", e)
  }

  if (shouldStartPremiumWindow) {
    try {
      const adminSupabase = await createAdminClient()
      const alertResult = await sendPremiumListingAlert(adminSupabase, listing.id)
      console.log('Premium listing alert sent after direct premium listing creation:', alertResult)
    } catch (err) {
      console.error('Failed to send premium listing alert after direct creation:', err)
    }

    // Skip Stripe and redirect directly to success for Premium users choosing Premium listing.
    const headersList = await import('next/headers').then(m => m.headers())
    const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    redirect(`${origin}/catalog/${listing.id}?success=true`)
  }

  if (listingPlan === 'free') {
    const headersList = await import('next/headers').then(m => m.headers())
    const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    redirect(`${origin}/catalog/${listing.id}?success=true&plan=free`)
  }

  // Use Stripe to charge the 5 EUR Premium listing fee.
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
  })

  // Redirect to Stripe Checkout
  if (session.url) {
    redirect(session.url)
  } else {
    throw new Error('Failed to create Stripe session')
  }
}
