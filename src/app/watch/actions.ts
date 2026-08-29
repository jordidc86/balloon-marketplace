'use server'

import { createAdminClient } from '@/utils/supabase/server'
import { verifyListingWatchAction } from '@/utils/listing-watch.mjs'

export type WatchDecisionState = { success: boolean; message: string }

const credentials = (formData: FormData) => {
  const id = formData.get('id')
  const token = formData.get('token')
  return {
    id: typeof id === 'string' ? id.trim() : '',
    token: typeof token === 'string' ? token.trim() : '',
  }
}

export async function confirmListingWatch(_state: WatchDecisionState, formData: FormData): Promise<WatchDecisionState> {
  const { id, token } = credentials(formData)
  if (!verifyListingWatchAction(id, 'confirm', token, process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return { success: false, message: 'This confirmation link is invalid.' }
  }
  const admin = await createAdminClient()
  const { data: watcher, error } = await admin.from('listing_watchers').select('id,status').eq('id', id).maybeSingle()
  if (error || !watcher) return { success: false, message: 'This watch request could not be found.' }
  if (watcher.status === 'ACTIVE') return { success: true, message: 'Listing updates are already active.' }
  if (watcher.status !== 'PENDING_CONFIRMATION') return { success: false, message: 'This watch request can no longer be confirmed.' }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await admin
    .from('listing_watchers')
    .update({ status: 'ACTIVE', confirmed_at: now, unsubscribed_at: null })
    .eq('id', watcher.id)
    .eq('status', 'PENDING_CONFIRMATION')
    .select('status,confirmed_at')
    .single()
  if (updateError || updated?.status !== 'ACTIVE' || !updated.confirmed_at) {
    const { data: reconciled } = await admin.from('listing_watchers').select('status,confirmed_at').eq('id', watcher.id).maybeSingle()
    if (reconciled?.status === 'ACTIVE' && reconciled.confirmed_at) {
      return { success: true, message: 'Listing updates are already active.' }
    }
    return { success: false, message: 'AeroTrade could not activate this watch safely.' }
  }
  return { success: true, message: 'Listing updates are active. You will hear only when a material detail changes.' }
}

export async function unsubscribeListingWatch(_state: WatchDecisionState, formData: FormData): Promise<WatchDecisionState> {
  const { id, token } = credentials(formData)
  if (!verifyListingWatchAction(id, 'unsubscribe', token, process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return { success: false, message: 'This unsubscribe link is invalid.' }
  }
  const admin = await createAdminClient()
  const { data: watcher, error } = await admin.from('listing_watchers').select('id,status').eq('id', id).maybeSingle()
  if (error || !watcher) return { success: false, message: 'This listing watch could not be found.' }
  if (watcher.status === 'UNSUBSCRIBED') return { success: true, message: 'This listing watch is already inactive.' }
  if (watcher.status === 'BLOCKED') return { success: true, message: 'No listing updates will be sent.' }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await admin
    .from('listing_watchers')
    .update({ status: 'UNSUBSCRIBED', unsubscribed_at: now })
    .eq('id', watcher.id)
    .in('status', ['PENDING_CONFIRMATION', 'ACTIVE'])
    .select('status,unsubscribed_at')
    .single()
  if (updateError || updated?.status !== 'UNSUBSCRIBED' || !updated.unsubscribed_at) {
    const { data: reconciled } = await admin.from('listing_watchers').select('status,unsubscribed_at').eq('id', watcher.id).maybeSingle()
    if (reconciled?.status === 'UNSUBSCRIBED' && reconciled.unsubscribed_at) {
      return { success: true, message: 'This listing watch is already inactive.' }
    }
    return { success: false, message: 'AeroTrade could not stop this watch safely.' }
  }
  return { success: true, message: 'You will no longer receive updates for this listing.' }
}
