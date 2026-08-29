'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { sendEmail } from '@/utils/resend'
import { escapeHtml } from '@/utils/html'
import { getListingPlan, premiumListingFeeCents } from '@/utils/listing-plans'
import { getApplicationOrigin } from '@/utils/navigation.mjs'
import { getInitialListingPublication, parseListingImageUrls } from '@/utils/listing-safety.mjs'
import { siteUrl } from '@/utils/site'
import { parseListingSubmission } from '@/utils/listing-submission.mjs'

export async function submitListing(formData: FormData) {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const listingPlan = getListingPlan(formData.get('listing_plan'))
  const publication = getInitialListingPublication(listingPlan)
  const imageUrls = parseListingImageUrls(formData.get('image_urls'))
  const submission = parseListingSubmission(formData)
  const details = { ...submission.details, listing_plan: listingPlan }

  // Generate a random ID for the listing
  const listingData = {
    seller_id: user.id,
    ...submission,
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

  const adminEmail = process.env.ADMIN_EMAIL?.trim()
  const adminSupabase = await createAdminClient()
  const notificationKey = `listing-created-admin-${publishedListing.id}`
  const { data: receipt, error: receiptError } = await adminSupabase
    .from('commercial_notification_receipts')
    .upsert({
      notification_type: 'listing_created_admin',
      entity_type: 'listing',
      entity_id: publishedListing.id,
      recipient_role: 'admin',
      status: 'pending',
      idempotency_key: notificationKey,
    }, { onConflict: 'idempotency_key' })
    .select('id')
    .single()

  if (receiptError || !receipt?.id) {
    console.error('Could not persist the new-listing notification attempt:', receiptError)
  } else {
    const delivery = adminEmail
      ? await sendEmail(
        adminEmail,
        'Nuevo anuncio en AeroTrade',
        `<p>Se ha creado un nuevo anuncio:</p>
        <p>Plan: ${escapeHtml(listingPlan)}</p>
        <p>Título: ${escapeHtml(publishedListing.title)}</p>
        <p>Categoría: ${escapeHtml(publishedListing.category)}</p>
        <p>Precio: ${escapeHtml(publishedListing.price)}</p>
        <p>Usuario ID: ${escapeHtml(user.id)}</p>
        <p>Email contacto: ${escapeHtml(publishedListing.contact_email)}</p>
        <p>Status: ${escapeHtml(publishedListing.status)}</p>`,
        { idempotencyKey: notificationKey },
      )
      : { success: false, resendId: undefined }

    const accepted = delivery.success && delivery.resendId
    const expectedStatus = accepted ? 'accepted' : 'failed'
    const now = new Date().toISOString()
    const { data: notificationReadback, error: notificationError } = await adminSupabase
      .from('commercial_notification_receipts')
      .update({
        status: expectedStatus,
        provider_message_id: accepted ? delivery.resendId : null,
        error_message: accepted ? null : adminEmail ? 'Provider acceptance was not confirmed.' : 'ADMIN_EMAIL is not configured.',
        attempted_at: now,
        accepted_at: accepted ? now : null,
      })
      .eq('id', receipt.id)
      .select('id,status')
      .single()

    if (notificationError || notificationReadback?.status !== expectedStatus) {
      console.error('Could not persist the new-listing notification result:', notificationError)
    }
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
