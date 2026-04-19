'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/utils/resend'

async function checkAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not logged in')
  
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Not authorized')
  
  return supabase
}

export async function togglePremiumStatus(userId: string, currentStatus: boolean) {
  const supabase = await checkAdmin()
  const { error } = await supabase.from('users').update({ is_premium: !currentStatus }).eq('id', userId)
  if (error) throw new Error('Failed to toggle premium status')
  revalidatePath('/admin/users')
}

export async function forcePublishListing(listingId: string) {
  const supabase = await checkAdmin()
  
  const { error } = await supabase.from('listings').update({ 
    status: 'ACTIVE_PUBLIC',
    public_at: new Date().toISOString()
  }).eq('id', listingId)
  
  if (error) throw new Error('Failed to publish listing')
  revalidatePath('/admin/listings')
}

export async function deleteListing(listingId: string) {
  const supabase = await checkAdmin()
  const { error } = await supabase.from('listings').delete().eq('id', listingId)
  if (error) throw new Error('Failed to delete listing')
  revalidatePath('/admin/listings')
}

export async function markListingSold(listingId: string) {
  const supabase = await checkAdmin()
  const { error } = await supabase.from('listings').update({ status: 'SOLD' }).eq('id', listingId)
  if (error) throw new Error('Failed to mark as sold')
  revalidatePath('/admin/listings')
}

export async function promoteListing(listingId: string) {
  const supabase = await checkAdmin()
  
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

  // Send emails using the resend utility
  const htmlContent = `
    <h2>AeroTrade Premium Alert</h2>
    <p>A new hot listing just hit the marketplace!</p>
    <h3>${listing.title}</h3>
    <p><strong>Category:</strong> ${listing.category}</p>
    <p><strong>Price:</strong> ${listing.price.toLocaleString()} ${listing.currency}</p>
    <br/>
    <a href="https://aerotrade-mvp-app.netlify.app/catalog/${listingId}">View Listing on AeroTrade</a>
  `

  const promises = premiumUsers.map(user => 
    sendEmail(
      user.email, 
      `Premium Alert: ${listing.title} is now available`, 
      htmlContent
    )
  )
  
  await Promise.all(promises)
  
  return { success: true, count: premiumUsers.length }
}
