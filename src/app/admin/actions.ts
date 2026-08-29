'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { escapeHtml } from '@/utils/html'
import { siteUrl } from '@/utils/site'
import { sendEmail } from '@/utils/resend'
import { sendPremiumListingAlert } from '@/utils/premium-alerts'
import { revalidatePath } from 'next/cache'
import { isClosedInquiryStatus, normalizeInquiryStatus } from '@/utils/inquiry-safety.mjs'
import { parseCommercialOutcome } from '@/utils/commercial-outcome.mjs'
import { normalizeWantedRequestStatus } from '@/utils/wanted-request.mjs'

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')

  return { supabase: await createAdminClient(), adminUserId: user.id }
}

export async function togglePremiumStatus(userId: string) {
  const { supabase, adminUserId } = await checkAdmin()
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('is_premium, premium_source')
    .eq('id', userId)
    .single()

  if (targetError || !targetUser) throw new Error('User not found')
  if (targetUser.is_premium && targetUser.premium_source === 'stripe') {
    throw new Error('Stripe-managed Premium must be changed through Stripe billing')
  }

  const nextStatus = !targetUser.is_premium
  const { error } = await supabase
    .from('users')
    .update({
      is_premium: nextStatus,
      premium_source: nextStatus ? 'admin' : null,
      premium_granted_by: nextStatus ? adminUserId : null,
      premium_granted_at: nextStatus ? new Date().toISOString() : null,
      premium_revoked_at: nextStatus ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)

  if (error) throw new Error('Failed to toggle premium status')
  revalidatePath('/admin/users')
}

export async function sendPremiumPaymentLink(userId: string) {
  const { supabase } = await checkAdmin()

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, name, is_premium')
    .eq('id', userId)
    .single()

  if (userError || !user) {
    throw new Error('User not found')
  }

  if (user.is_premium) {
    throw new Error('User is already premium')
  }

  const { stripe } = await import('@/utils/stripe')
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer_email: user.email,
    line_items: [
      {
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'AeroTrade Premium Club',
            description: '48-hour Early Access & Instant Alerts',
          },
          unit_amount: 999,
          recurring: { interval: 'year' },
        },
        quantity: 1,
      },
    ],
    metadata: {
      type: 'premium_subscription',
      user_id: user.id,
      source: 'admin_payment_link',
    },
    mode: 'subscription',
    success_url: `${siteUrl}/login?message=Payment successful! Please log in to access your Premium Dashboard.`,
    cancel_url: `${siteUrl}/pricing?canceled=true`,
  })

  if (!session.url) {
    throw new Error('Failed to create Stripe payment link')
  }

  const displayName = user.name || 'there'
  await sendEmail(
    user.email,
    'Complete your AeroTrade Premium subscription',
    `<p>Hi ${escapeHtml(displayName)},</p>
    <p>Thanks for your interest in AeroTrade Premium.</p>
    <p>You can complete your Premium subscription securely through Stripe here:</p>
    <p><a href="${escapeHtml(session.url)}">Complete AeroTrade Premium payment</a></p>
    <p>Premium gives you early access to Premium listings and instant alerts for new gear.</p>
    <p>If you did not request this, you can ignore this email.</p>`
  )

  revalidatePath('/admin/users')
}

export async function forcePublishListing(listingId: string) {
  const { supabase } = await checkAdmin()

  const { error } = await supabase.from('listings').update({
    status: 'ACTIVE_PUBLIC',
    public_at: new Date().toISOString()
  }).eq('id', listingId)

  if (error) throw new Error('Failed to publish listing')

  revalidatePath('/admin/listings')
}

export async function deleteListing(listingId: string) {
  const { supabase } = await checkAdmin()
  const { error } = await supabase.from('listings').delete().eq('id', listingId)
  if (error) throw new Error('Failed to delete listing')
  revalidatePath('/admin/listings')
}

export async function markListingSold(listingId: string) {
  const { supabase } = await checkAdmin()
  const { error } = await supabase.from('listings').update({ status: 'SOLD' }).eq('id', listingId)
  if (error) throw new Error('Failed to mark as sold')
  revalidatePath('/admin/listings')
}

export async function promoteListing(listingId: string) {
  const { supabase } = await checkAdmin()

  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('status')
    .eq('id', listingId)
    .single()

  if (listingError || !listing) throw new Error('Listing not found')

  if (listing.status !== 'ACTIVE_PREMIUM') {
    throw new Error('Only active premium listings can be promoted to premium users')
  }

  return sendPremiumListingAlert(supabase, listingId)
}

export async function updateAdminInquiryStatus(inquiryId: string, formData: FormData) {
  const { supabase } = await checkAdmin()
  const status = normalizeInquiryStatus(formData.get('status'))
  if (!status) throw new Error('Invalid enquiry status')

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('marketplace_inquiries')
    .update({
      status,
      last_activity_at: now,
      closed_at: isClosedInquiryStatus(status) ? now : null,
    })
    .eq('id', inquiryId)
    .select('id,status')
    .single()

  if (error || !data?.id || data.status !== status) throw new Error('Could not update enquiry status')
  revalidatePath('/admin/commercial')
  revalidatePath('/dashboard')
}

export async function updateQuoteRequestStatus(requestId: string, formData: FormData) {
  const { supabase } = await checkAdmin()
  const status = formData.get('status')
  const allowed = ['NEW', 'CONTACTED', 'SENT_TO_PARTNER', 'QUOTE_SENT', 'WON', 'LOST']
  if (typeof status !== 'string' || !allowed.includes(status)) throw new Error('Invalid quote status')

  const { data, error } = await supabase
    .from('quote_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .select('id,status')
    .single()

  if (error || !data?.id || data.status !== status) throw new Error('Could not update quote status')
  revalidatePath('/admin/commercial')
}

export async function updateWantedRequestStatus(requestId: string, formData: FormData) {
  const { supabase } = await checkAdmin()
  const status = normalizeWantedRequestStatus(formData.get('status'))
  if (!status) throw new Error('Invalid wanted-request status')

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('wanted_requests')
    .update({
      status,
      last_activity_at: now,
      closed_at: ['CLOSED', 'SPAM'].includes(status) ? now : null,
    })
    .eq('id', requestId)
    .select('id,status')
    .single()

  if (error || data?.id !== requestId || data.status !== status) throw new Error('Could not persist wanted-request status')
  revalidatePath('/admin/commercial')
}

export async function recordCommercialOutcome(
  entityType: 'marketplace_inquiry' | 'quote_request',
  entityId: string,
  formData: FormData,
) {
  const { supabase, adminUserId } = await checkAdmin()
  const outcome = parseCommercialOutcome(formData)
  const table = entityType === 'marketplace_inquiry' ? 'marketplace_inquiries' : 'quote_requests'

  const { data: entity, error: entityError } = await supabase
    .from(table)
    .select('id')
    .eq('id', entityId)
    .single()
  if (entityError || !entity?.id) throw new Error('Commercial opportunity not found')

  const now = new Date().toISOString()
  const { data: stored, error: outcomeError } = await supabase
    .from('commercial_outcomes')
    .upsert({
      entity_type: entityType,
      entity_id: entityId,
      ...outcome,
      recorded_by: adminUserId,
      closed_at: now,
    }, { onConflict: 'entity_type,entity_id' })
    .select('id,entity_type,entity_id,gross_amount_minor,aerotrade_revenue_minor,evidence_level')
    .single()

  if (outcomeError || !stored?.id
    || stored.entity_type !== entityType
    || stored.entity_id !== entityId
    || Number(stored.gross_amount_minor) !== outcome.gross_amount_minor
    || Number(stored.aerotrade_revenue_minor) !== outcome.aerotrade_revenue_minor
    || stored.evidence_level !== outcome.evidence_level) {
    throw new Error('Could not persist and verify the commercial outcome')
  }

  const statusUpdate = entityType === 'marketplace_inquiry'
    ? { status: 'WON', last_activity_at: now, closed_at: now }
    : { status: 'WON', updated_at: now }
  const { data: statusReadback, error: statusError } = await supabase
    .from(table)
    .update(statusUpdate)
    .eq('id', entityId)
    .select('id,status')
    .single()

  if (statusError || statusReadback?.status !== 'WON') {
    throw new Error('Outcome stored, but the opportunity status needs review')
  }

  revalidatePath('/admin/commercial')
  revalidatePath('/dashboard')
}

export async function setListingVerification(listingId: string, formData: FormData) {
  const { supabase, adminUserId } = await checkAdmin()
  const action = formData.get('verification_action')
  if (action !== 'verify' && action !== 'unverify') throw new Error('Invalid verification action')

  const verified = action === 'verify'
  if (verified && (formData.get('identity_checked') !== 'yes' || formData.get('supporting_documents_checked') !== 'yes')) {
    throw new Error('Confirm both identity and supporting-document review before publishing a verification badge')
  }

  const now = new Date().toISOString()
  const status = verified ? 'VERIFIED' : 'UNVERIFIED'
  const { data, error } = await supabase
    .from('listing_verifications')
    .upsert({
      listing_id: listingId,
      status,
      identity_checked: verified,
      supporting_documents_checked: verified,
      verified_by: verified ? adminUserId : null,
      verified_at: verified ? now : null,
    }, { onConflict: 'listing_id' })
    .select('listing_id,status')
    .single()

  if (error || data?.listing_id !== listingId || data.status !== status) {
    throw new Error('Could not persist listing verification')
  }

  revalidatePath('/admin/listings')
  revalidatePath(`/catalog/${listingId}`)
}
