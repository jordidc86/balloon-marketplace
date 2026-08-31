import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeNewsletterEmail } from '@/utils/newsletter-consent.mjs'

export const dynamic = 'force-dynamic'

type EligibleProfile = {
  id: string
  email: string
  role: string
  newsletter_consent_status: string
  newsletter_consented_at: string | null
  newsletter_unsubscribed_at: string | null
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

  const url = new URL(request.url)
  const commit = url.searchParams.get('commit') === '1'
  if (commit) {
    return NextResponse.json({
      success: false,
      error: 'Live consent invitations require the exact reviewed batch in Admin Users; blanket cron delivery is disabled.',
    }, { status: 409 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const { data, error } = await supabase
    .from('users')
    .select('id,email,role,newsletter_consent_status,newsletter_consented_at,newsletter_unsubscribed_at')
    .eq('newsletter_consent_status', 'NOT_REQUESTED')
    .neq('role', 'admin')
    .order('id')
    .limit(500)
  if (error) return NextResponse.json({ success: false, error: 'Eligible preferences could not be read.' }, { status: 500 })

  const candidates = ((data || []) as EligibleProfile[]).filter((profile) => Boolean(
    normalizeNewsletterEmail(profile.email)
    && !profile.newsletter_consented_at
    && !profile.newsletter_unsubscribed_at,
  ))
  const candidateIds = candidates.map((profile) => profile.id)
  const [{ data: exclusions, error: exclusionsError }, { data: receipts, error: receiptsError }] = await Promise.all([
    candidateIds.length
      ? supabase.from('newsletter_consent_invitation_exclusions').select('user_id').in('user_id', candidateIds)
      : Promise.resolve({ data: [], error: null }),
    candidateIds.length
      ? supabase.from('commercial_notification_receipts').select('entity_id,status').eq('notification_type', 'newsletter_consent_invitation').eq('entity_type', 'user').in('entity_id', candidateIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (exclusionsError || receiptsError) {
    return NextResponse.json({ success: false, error: 'Invitation safeguards could not be read.' }, { status: 500 })
  }
  const excludedIds = new Set((exclusions || []).map((row) => row.user_id))
  const invitedIds = new Set((receipts || []).filter((row) => row.status === 'accepted').map((row) => row.entity_id))
  const eligible = candidates.filter((profile) => !excludedIds.has(profile.id) && !invitedIds.has(profile.id))

  return NextResponse.json({
    success: true,
    dryRun: true,
    candidateCount: candidates.length,
    eligibleCount: eligible.length,
    excludedCount: candidates.filter((profile) => excludedIds.has(profile.id)).length,
    alreadyInvitedCount: candidates.filter((profile) => invitedIds.has(profile.id)).length,
    sentCount: 0,
    failedCount: 0,
  })
}
