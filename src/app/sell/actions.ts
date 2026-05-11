'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { sendEmail } from '@/utils/resend'
// Note: Stripe will be integrated here later for the 5 EUR checkout

export async function submitListing(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
  const isPremium = profile?.is_premium || false

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
    details.type = formData.get('type') // burner type
  }

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
    status: isPremium ? 'ACTIVE_PREMIUM' : 'DRAFT',
    public_at: isPremium ? new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() : null,
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
      <p>Título: ${listing.title}</p>
      <p>Categoría: ${listing.category}</p>
      <p>Precio: ${listing.price}</p>
      <p>Usuario ID: ${user.id}</p>
      <p>Email contacto: ${listing.contact_email}</p>
      <p>Status: ${listing.status}</p>`
    )
  } catch (e) {
    console.error("Error sending notification:", e)
  }

  if (isPremium) {
    // Skip Stripe and redirect directly to success for Premium users
    const headersList = await import('next/headers').then(m => m.headers())
    const origin = headersList.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    redirect(`${origin}/catalog/${listing.id}?success=true`)
  }

  // Use Stripe to charge the 5 EUR listing fee
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
          unit_amount: 500, // 5.00 EUR in cents
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
    cancel_url: `${origin}/sell?canceled=true`,
  })

  // Redirect to Stripe Checkout
  if (session.url) {
    redirect(session.url)
  } else {
    throw new Error('Failed to create Stripe session')
  }
}
