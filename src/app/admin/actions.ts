'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

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
  const publicAt = new Date()
  publicAt.setHours(publicAt.getHours() + 48) // Grant 48-hour premium window
  
  const { error } = await supabase.from('listings').update({ 
    status: 'ACTIVE_PREMIUM',
    public_at: publicAt.toISOString()
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
