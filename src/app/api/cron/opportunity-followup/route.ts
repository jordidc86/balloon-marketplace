import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml } from '@/utils/html'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { getOpportunityFollowupCutoff, openInquiryStatuses, openQuoteStatuses } from '@/utils/opportunity-followup.mjs'
import { siteUrl } from '@/utils/site'

export const dynamic = 'force-dynamic'

type Inquiry = {
  id: string
  status: string
  last_activity_at: string
  listings: { id: string; title: string; contact_email: string } | Array<{ id: string; title: string; contact_email: string }> | null
}

const isAuthorized = (request: Request) => {
  const secret = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!secret || supplied.length !== secret.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))
}

const getInquiryListing = (inquiry: Inquiry) => Array.isArray(inquiry.listings) ? inquiry.listings[0] : inquiry.listings

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const commit = new URL(request.url).searchParams.get('commit') === '1'
  const cutoff = getOpportunityFollowupCutoff()
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const [inquiryResult, quoteResult] = await Promise.all([
    supabase
      .from('marketplace_inquiries')
      .select('id,status,last_activity_at,listings(id,title,contact_email)')
      .in('status', openInquiryStatuses)
      .lte('last_activity_at', cutoff)
      .order('last_activity_at', { ascending: true })
      .limit(100),
    supabase
      .from('quote_requests')
      .select('id,status,updated_at')
      .in('status', openQuoteStatuses)
      .lte('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(100),
  ])
  if (inquiryResult.error || quoteResult.error) {
    return NextResponse.json({ error: 'Open opportunities could not be loaded' }, { status: 500 })
  }

  const inquiries = (inquiryResult.data || []) as unknown as Inquiry[]
  const quotes = quoteResult.data || []
  const result = {
    dueSellerEnquiries: inquiries.length,
    dueNewBalloonQuotes: quotes.length,
    accepted: 0,
    alreadyAccepted: 0,
    failed: 0,
    configurationBlocked: 0,
    dryRun: !commit,
  }
  if (!commit) return NextResponse.json(result)

  for (const inquiry of inquiries) {
    const listing = getInquiryListing(inquiry)
    if (!listing?.contact_email) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'inquiry_seller_followup',
        entityType: 'inquiry',
        entityId: inquiry.id,
        recipientRole: 'seller',
        to: listing.contact_email,
        subject: `AeroTrade reminder: buyer enquiry awaiting your response`,
        html: `<h2>A buyer enquiry still needs attention</h2>
        <p>Your AeroTrade listing <strong>${escapeHtml(listing.title)}</strong> has an enquiry that has remained open for more than 24 hours.</p>
        <p><a href="${escapeHtml(`${siteUrl}/dashboard`)}">Open your dashboard to contact the buyer and update the opportunity</a>.</p>
        <p>This is a single operational reminder, not a marketing campaign.</p>`,
        idempotencyKey: `inquiry-seller-followup-${inquiry.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else result.failed += 1
    } catch (error) {
      console.error('Seller enquiry follow-up failed:', error)
      result.failed += 1
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim()
  for (const quote of quotes) {
    if (!adminEmail) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'quote_admin_followup',
        entityType: 'quote_request',
        entityId: quote.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: 'AeroTrade: new-balloon quote awaiting action',
        html: `<h2>A new-balloon opportunity is still open</h2>
        <p>A factory-new Pasha or Schroeder quote request has remained in NEW status for more than 24 hours.</p>
        <p><a href="${escapeHtml(`${siteUrl}/admin/commercial`)}">Open the commercial pipeline and assign the next action</a>.</p>`,
        idempotencyKey: `quote-admin-followup-${quote.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else result.failed += 1
    } catch (error) {
      console.error('New-balloon quote follow-up failed:', error)
      result.failed += 1
    }
  }

  const hasFailure = result.failed > 0 || result.configurationBlocked > 0
  return NextResponse.json(result, { status: hasFailure ? 502 : 200 })
}
