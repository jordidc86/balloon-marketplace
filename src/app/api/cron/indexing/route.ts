import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { buildIndexNowSubmission, buildPublicIndexingUrls } from '@/utils/indexing.mjs'
import { siteUrl } from '@/utils/site'

export const dynamic = 'force-dynamic'

const indexNowKey = '015d1acf191553d5ce837027529a3f7f'

const isAuthorized = (request: Request) => {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!secret || supplied.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
}

const providerErrorCode = (status: number | null) => status === null ? 'NETWORK_ERROR' : 'PROVIDER_REJECTED'

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const commit = new URL(request.url).searchParams.get('commit') === '1'
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data: listings, error: listingError } = await supabase
    .from('listings')
    .select('id,category,status,public_at')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
  if (listingError) return NextResponse.json({ error: 'Public inventory could not be loaded' }, { status: 500 })

  const urls = buildPublicIndexingUrls({ origin: siteUrl, listings: listings || [] })
  const submission = buildIndexNowSubmission({ origin: siteUrl, key: indexNowKey, urls })
  const summary = {
    provider: 'INDEXNOW',
    urlCount: submission.payload.urlList.length,
    batch: submission.batchKey.slice(0, 12),
    committed: commit,
    accepted: false,
    duplicate: false,
  }
  if (!commit) return NextResponse.json(summary)

  const { error: insertError } = await supabase
    .from('indexing_submission_receipts')
    .upsert({
      batch_key: submission.batchKey,
      provider: 'INDEXNOW',
      url_fingerprint: submission.fingerprint,
      url_count: submission.payload.urlList.length,
      status: 'PENDING',
    }, { onConflict: 'batch_key', ignoreDuplicates: true })
  if (insertError) return NextResponse.json({ ...summary, error: 'Submission receipt could not be created' }, { status: 500 })

  const { data: receipt, error: receiptError } = await supabase
    .from('indexing_submission_receipts')
    .select('id,status,attempts,provider_status_code')
    .eq('batch_key', submission.batchKey)
    .single()
  if (receiptError || !receipt) return NextResponse.json({ ...summary, error: 'Submission receipt could not be read back' }, { status: 500 })
  if (receipt.status === 'ACCEPTED') return NextResponse.json({ ...summary, accepted: true, duplicate: true })
  if (receipt.attempts >= 3) return NextResponse.json({ ...summary, error: 'Retry limit reached' }, { status: 502 })

  const attemptedAt = new Date().toISOString()
  const nextAttempts = receipt.attempts + 1
  const { data: attempted, error: attemptError } = await supabase
    .from('indexing_submission_receipts')
    .update({ attempts: nextAttempts, attempted_at: attemptedAt, error_code: null })
    .eq('id', receipt.id)
    .eq('attempts', receipt.attempts)
    .select('id,attempts')
    .maybeSingle()
  if (attemptError || !attempted || attempted.attempts !== nextAttempts) {
    return NextResponse.json({ ...summary, error: 'Another submission attempt is already in progress' }, { status: 409 })
  }

  let providerStatus: number | null = null
  try {
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(submission.payload),
      signal: AbortSignal.timeout(15_000),
    })
    providerStatus = response.status
  } catch (error) {
    console.error('IndexNow submission failed:', error)
  }

  const accepted = providerStatus === 200 || providerStatus === 202
  const acceptedAt = accepted ? new Date().toISOString() : null
  const { data: readback, error: updateError } = await supabase
    .from('indexing_submission_receipts')
    .update({
      status: accepted ? 'ACCEPTED' : 'FAILED',
      provider_status_code: providerStatus,
      error_code: accepted ? null : providerErrorCode(providerStatus),
      accepted_at: acceptedAt,
    })
    .eq('id', receipt.id)
    .select('status,attempts,provider_status_code,accepted_at')
    .single()
  if (updateError || readback?.status !== (accepted ? 'ACCEPTED' : 'FAILED') || readback?.attempts !== nextAttempts) {
    return NextResponse.json({ ...summary, error: 'Provider result could not be persisted' }, { status: 500 })
  }

  return NextResponse.json({
    ...summary,
    accepted,
    providerStatus: readback.provider_status_code,
  }, { status: accepted ? 200 : 502 })
}
