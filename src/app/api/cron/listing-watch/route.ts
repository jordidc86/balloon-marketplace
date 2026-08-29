import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml } from '@/utils/html'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { createListingWatchSnapshot, isListingWatchDispatchRetryable, signListingWatchAction } from '@/utils/listing-watch.mjs'
import { siteUrl } from '@/utils/site'

export const dynamic = 'force-dynamic'

type Watcher = {
  id: string
  listing_id: string
  email: string
  status: 'ACTIVE'
  initial_snapshot_hash: string
  last_notified_snapshot_hash: string | null
}

type Listing = {
  id: string
  title: string
  status: string
  public_at: string | null
  price: number
  currency: string
  condition: string
  location_country: string
}

type WatchDispatch = {
  id: string
  watcher_id: string
  listing_id: string
  snapshot_hash: string
  status: 'PENDING' | 'ACCEPTED' | 'FAILED' | 'CANCELLED'
  provider_message_id: string | null
  updated_at: string
}

const isAuthorized = (request: Request) => {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!secret || supplied.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  const commit = new URL(request.url).searchParams.get('commit') === '1'
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: watchersData, error: watcherError } = await supabase
    .from('listing_watchers')
    .select('id,listing_id,email,status,initial_snapshot_hash,last_notified_snapshot_hash')
    .eq('status', 'ACTIVE')
    .order('created_at', { ascending: true })
    .limit(1000)
  if (watcherError) return NextResponse.json({ error: 'Listing-watch state could not be loaded' }, { status: 500 })

  const watchers = (watchersData || []) as Watcher[]
  const result = { activeWatchers: watchers.length, changed: 0, due: 0, accepted: 0, alreadyAccepted: 0, failed: 0, cancelled: 0, pendingRecovery: 0, dryRun: !commit }
  if (watchers.length === 0) return NextResponse.json(result)

  const listingIds = Array.from(new Set(watchers.map((watcher) => watcher.listing_id)))
  const watcherIds = watchers.map((watcher) => watcher.id)
  const [{ data: listingData, error: listingError }, { data: dispatchData, error: dispatchError }] = await Promise.all([
    supabase.from('listings').select('id,title,status,public_at,price,currency,condition,location_country').in('id', listingIds),
    supabase.from('listing_watch_dispatches').select('id,watcher_id,listing_id,snapshot_hash,status,provider_message_id,updated_at').in('watcher_id', watcherIds).order('created_at', { ascending: true }).limit(5000),
  ])
  if (listingError || dispatchError) return NextResponse.json({ error: 'Listing-watch comparison state could not be loaded' }, { status: 500 })
  const listings = new Map(((listingData || []) as Listing[]).map((listing) => [listing.id, listing]))
  const dispatches = (dispatchData || []) as WatchDispatch[]
  const dispatchByKey = new Map(dispatches.map((dispatch) => [`${dispatch.watcher_id}:${dispatch.snapshot_hash}`, dispatch]))

  for (const watcher of watchers) {
    const listing = listings.get(watcher.listing_id)
    if (!listing) continue
    let snapshot
    try {
      snapshot = createListingWatchSnapshot(listing)
    } catch {
      result.failed += 1
      continue
    }
    const stillEarlyAccess = listing.status === 'ACTIVE_PREMIUM'
      && (!listing.public_at || new Date(listing.public_at).getTime() > Date.now())
    if (stillEarlyAccess) continue
    const baseline = watcher.last_notified_snapshot_hash || watcher.initial_snapshot_hash
    if (snapshot.hash === baseline) continue
    result.changed += 1
    const key = `${watcher.id}:${snapshot.hash}`
    let dispatch = dispatchByKey.get(key)

    if (dispatch?.status === 'ACCEPTED' && dispatch.provider_message_id) {
      if (commit) {
        const { data: reconciled } = await supabase.from('listing_watchers').update({ last_notified_snapshot_hash: snapshot.hash, last_notified_at: new Date().toISOString() }).eq('id', watcher.id).eq('status', 'ACTIVE').select('last_notified_snapshot_hash').maybeSingle()
        if (reconciled?.last_notified_snapshot_hash !== snapshot.hash) result.failed += 1
        else result.alreadyAccepted += 1
      } else result.alreadyAccepted += 1
      continue
    }
    if (dispatch && !isListingWatchDispatchRetryable(dispatch)) {
      result.pendingRecovery += 1
      continue
    }
    result.due += 1
    if (!commit) continue

    if (!dispatch) {
      const { data: created, error } = await supabase
        .from('listing_watch_dispatches')
        .insert({ watcher_id: watcher.id, listing_id: listing.id, snapshot_hash: snapshot.hash, status: 'PENDING' })
        .select('id,watcher_id,listing_id,snapshot_hash,status,provider_message_id,updated_at')
        .single()
      if (error || !created?.id) {
        const { data: concurrent } = await supabase.from('listing_watch_dispatches').select('id,watcher_id,listing_id,snapshot_hash,status,provider_message_id,updated_at').eq('watcher_id', watcher.id).eq('snapshot_hash', snapshot.hash).maybeSingle()
        if (!concurrent?.id) {
          result.failed += 1
          continue
        }
        dispatch = concurrent as WatchDispatch
      } else dispatch = created as WatchDispatch
    }

    const { data: stillActive } = await supabase.from('listing_watchers').select('status').eq('id', watcher.id).maybeSingle()
    if (stillActive?.status !== 'ACTIVE') {
      const { data: cancelled } = await supabase.from('listing_watch_dispatches').update({ status: 'CANCELLED', attempted_at: new Date().toISOString() }).eq('id', dispatch.id).select('status').single()
      if (cancelled?.status === 'CANCELLED') result.cancelled += 1
      else result.failed += 1
      continue
    }

    try {
      const attemptedAt = new Date().toISOString()
      const { data: pending, error: pendingError } = await supabase.from('listing_watch_dispatches').update({ status: 'PENDING', attempted_at: attemptedAt }).eq('id', dispatch.id).select('status').single()
      if (pendingError || pending?.status !== 'PENDING') throw new Error('Watch dispatch did not enter pending state')
      const unsubscribeToken = signListingWatchAction(watcher.id, 'unsubscribe', serviceRoleKey)
      if (!unsubscribeToken) throw new Error('Unsubscribe token could not be created')
      const unsubscribeUrl = `${siteUrl}/watch/unsubscribe?id=${encodeURIComponent(watcher.id)}&token=${encodeURIComponent(unsubscribeToken)}`
      const isPublic = listing.status === 'ACTIVE_PUBLIC'
        || (listing.status === 'ACTIVE_PREMIUM' && Boolean(listing.public_at) && new Date(listing.public_at as string).getTime() <= Date.now())
      const price = new Intl.NumberFormat('en-IE', { style: 'currency', currency: snapshot.currency }).format(snapshot.price)
      const listingUrl = `${siteUrl}/catalog/${listing.id}`
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'listing_watch_update',
        entityType: 'listing_watch',
        entityId: watcher.id,
        recipientRole: 'buyer',
        to: watcher.email,
        subject: `AeroTrade listing update: ${snapshot.title}`,
        html: `<h2>A listing you watch has changed</h2>
        <p><strong>${escapeHtml(snapshot.title)}</strong></p>
        <p>Status: <strong>${escapeHtml(isPublic ? 'Available' : 'No longer publicly available')}</strong><br />Price: <strong>${escapeHtml(price)}</strong><br />Condition: ${escapeHtml(snapshot.condition || 'Not specified')}<br />Location: ${escapeHtml(snapshot.location || 'Not specified')}</p>
        ${isPublic ? `<p><a href="${escapeHtml(listingUrl)}">Review the current listing</a></p>` : ''}
        <p>This operational alert was requested for this specific listing. It is not a marketing email.</p>
        <p><a href="${escapeHtml(unsubscribeUrl)}">Stop updates for this listing</a></p>`,
        idempotencyKey: `listing-watch-update-${watcher.id}-${snapshot.hash}`,
      })
      const nextStatus = delivery.success ? 'ACCEPTED' : 'FAILED'
      const completedAt = new Date().toISOString()
      const { data: dispatchReadback, error: updateError } = await supabase.from('listing_watch_dispatches').update({ status: nextStatus, provider_message_id: delivery.providerMessageId || null, attempted_at: completedAt, accepted_at: delivery.success ? completedAt : null }).eq('id', dispatch.id).select('status,provider_message_id').single()
      if (updateError || dispatchReadback?.status !== nextStatus) throw new Error('Watch dispatch result did not persist')
      if (!delivery.success) {
        result.failed += 1
        continue
      }
      const { data: watcherReadback, error: watcherUpdateError } = await supabase.from('listing_watchers').update({ last_notified_snapshot_hash: snapshot.hash, last_notified_at: completedAt }).eq('id', watcher.id).eq('status', 'ACTIVE').select('last_notified_snapshot_hash').single()
      if (watcherUpdateError || watcherReadback?.last_notified_snapshot_hash !== snapshot.hash) throw new Error('Watcher result did not persist')
      if (delivery.duplicate) result.alreadyAccepted += 1
      else result.accepted += 1
    } catch (error) {
      console.error('Listing-watch dispatch failed:', error)
      await supabase.from('listing_watch_dispatches').update({ status: 'FAILED', attempted_at: new Date().toISOString() }).eq('id', dispatch.id)
      result.failed += 1
    }
  }

  return NextResponse.json(result, { status: result.failed > 0 ? 502 : 200 })
}
