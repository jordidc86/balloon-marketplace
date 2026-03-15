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
