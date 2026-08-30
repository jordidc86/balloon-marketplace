import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml } from '@/utils/html'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import {
  newsletterConsentInvitationLifetimeMs,
  normalizeNewsletterEmail,
  signNewsletterConsentInvitationCapability,
} from '@/utils/newsletter-consent.mjs'
import { siteUrl } from '@/utils/site'

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

const invitationKey = (userId: string) => `newsletter-consent-invitation-v1-${userId}`
const invitationExpiresAt = Date.parse('2026-09-28T23:59:59Z')

const buildInvitationHtml = (confirmationUrl: string) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6">
    <h1 style="font-size:24px">Would you like AeroTrade marketplace updates?</h1>
    <p>You have an AeroTrade account. We are separating the optional bi-weekly marketplace newsletter from account and service messages.</p>
    <p>If you would like to receive up to two emails per month about current hot-air-balloon equipment, choose below. This invitation does not subscribe you by itself.</p>
    <p style="margin:28px 0"><a href="${escapeHtml(confirmationUrl)}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700">Yes, I want AeroTrade updates</a></p>
    <p style="font-size:13px;color:#64748b">If you do nothing, you will not receive the newsletter. This invitation is sent once and expires within 30 days. Operational account, listing, enquiry and payment messages are separate.</p>
  </div>`

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const url = new URL(request.url)
  const commit = url.searchParams.get('commit') === '1'
  const confirmed = url.searchParams.get('confirm') === 'SEND_ONE_TIME_CONSENT_INVITATIONS'
  if (commit && !confirmed) {
    return NextResponse.json({ success: false, error: 'Explicit live-send confirmation is required.' }, { status: 400 })
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

  const eligible = ((data || []) as EligibleProfile[]).filter((profile) => Boolean(
    normalizeNewsletterEmail(profile.email)
    && !profile.newsletter_consented_at
    && !profile.newsletter_unsubscribed_at,
  ))
  if (!commit) {
    return NextResponse.json({ success: true, dryRun: true, eligibleCount: eligible.length, sentCount: 0, failedCount: 0 })
  }

  const expiresAt = invitationExpiresAt
  if (expiresAt <= Date.now() || expiresAt - Date.now() > newsletterConsentInvitationLifetimeMs) {
    return NextResponse.json({ success: false, error: 'The approved invitation window is not active.' }, { status: 409 })
  }
  let sentCount = 0
  let duplicateCount = 0
  let failedCount = 0
  let skippedCount = 0
  for (const profile of eligible) {
    const token = signNewsletterConsentInvitationCapability({
      userId: profile.id,
      email: profile.email,
      expiresAt,
      secret: serviceRoleKey,
    })
    if (!token) {
      failedCount += 1
      continue
    }
    const params = new URLSearchParams({ id: profile.id, expires: String(expiresAt), token })
    const confirmationUrl = `${siteUrl}/newsletter/subscribe?${params.toString()}`
    const delivery = await sendCommercialReceiptEmail(supabase, {
      notificationType: 'newsletter_consent_invitation',
      entityType: 'user',
      entityId: profile.id,
      recipientRole: 'buyer',
      to: profile.email,
      subject: 'Choose whether to receive AeroTrade marketplace updates',
      html: buildInvitationHtml(confirmationUrl),
      idempotencyKey: invitationKey(profile.id),
    })
    if (delivery.success && delivery.duplicate) duplicateCount += 1
    else if (delivery.success) sentCount += 1
    else if (delivery.skipped) skippedCount += 1
    else failedCount += 1
  }

  return NextResponse.json({
    success: failedCount === 0,
    dryRun: false,
    eligibleCount: eligible.length,
    sentCount,
    duplicateCount,
    failedCount,
    skippedCount,
  }, { status: failedCount === 0 ? 200 : 500 })
}
