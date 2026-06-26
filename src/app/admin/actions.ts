'use server'

import { createClient, createAdminClient } from '@/utils/supabase/server'
import { escapeHtml } from '@/utils/html'
import { siteUrl } from '@/utils/site'
import { sendEmail } from '@/utils/resend'
import { revalidatePath } from 'next/cache'

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')

  return { supabase: await createAdminClient(), adminUserId: user.id }
}

export async function togglePremiumStatus(userId: string, currentStatus: boolean) {
  const { supabase, adminUserId } = await checkAdmin()
  const nextStatus = !currentStatus
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

  // Instantly alert premium users about the new published listing
  try {
    await promoteListing(listingId);
  } catch (err) {
    console.error('Failed to send premium alerts during force publish:', err);
  }

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

  // Get listing
  const { data: listing, error: listingError } = await supabase
    .from('listings')
    .select('title, category, price, currency')
    .eq('id', listingId)
    .single()

  if (listingError || !listing) throw new Error('Listing not found')

  // Get all premium users
  const { data: premiumUsers, error: usersError } = await supabase
    .from('users')
    .select('email')
    .eq('is_premium', true)

  if (usersError || !premiumUsers) throw new Error('Failed to fetch premium users')

  if (premiumUsers.length === 0) {
    return { success: true, count: 0 }
  }

  const formattedPrice = `${Number(listing.price).toLocaleString()} ${listing.currency}`
  const listingUrl = `${siteUrl}/catalog/${listingId}`

  // Send emails using the resend utility
  const htmlContent = `
    <h2>AeroTrade Premium Alert</h2>
    <p>A new hot listing just hit the marketplace!</p>
    <h3>${escapeHtml(listing.title)}</h3>
    <p><strong>Category:</strong> ${escapeHtml(listing.category)}</p>
    <p><strong>Price:</strong> ${escapeHtml(formattedPrice)}</p>
    <br/>
    <a href="${escapeHtml(listingUrl)}">View Listing on AeroTrade</a>
  `

  const emailBatch = premiumUsers
    .filter(user => user.email)
    .map(user => ({
      to: user.email,
      subject: `Premium Alert: ${listing.title} is now available`,
      html: htmlContent
    }))

  if (emailBatch.length > 0) {
    const { sendEmailBatch } = await import('@/utils/resend');
    await sendEmailBatch(emailBatch);
  }

  return { success: true, count: premiumUsers.length }
}
