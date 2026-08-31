import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escapeHtml } from '@/utils/html'
import { sendCommercialReceiptEmail } from '@/utils/commercial-notification'
import { getOpportunityFollowupCutoff, getSellerEnquiryEscalationCutoff, openInquiryStatuses, openQuoteStatuses } from '@/utils/opportunity-followup.mjs'
import { persistSellerFunnelEvent } from '@/utils/seller-funnel-server'
import { siteUrl } from '@/utils/site'
import { buildNewBalloonBuyerAcknowledgement } from '@/utils/new-balloon-buyer-acknowledgement.mjs'
import { buildInquiryBuyerAcknowledgement } from '@/utils/inquiry-buyer-acknowledgement.mjs'
import { inquiryBuyerPortalCapabilityLifetimeMs, signInquiryBuyerPortalCapability } from '@/utils/inquiry-buyer-capability.mjs'
import { buyerEarlyAccessProduct } from '@/utils/paid-product-labels.mjs'

export const dynamic = 'force-dynamic'

type Inquiry = {
  id: string
  status: string
  last_activity_at: string
  listings: { id: string; title: string; contact_email: string } | Array<{ id: string; title: string; contact_email: string }> | null
}

type PremiumListingRecovery = {
  id: string
  seller_id: string
  title: string
  contact_email: string
  status: 'PENDING_PAYMENT'
  created_at: string
}

type SellerAssistance = {
  id: string
  status: 'NEW'
  last_activity_at: string
}

type BuyerAcknowledgementRetry = {
  notification_type: 'new_balloon_buyer_ack' | 'inquiry_buyer_ack'
  entity_id: string
}

type NewBalloonQuote = {
  id: string
  email: string
  manufacturer_preference: string
  equipment_type: string
}

type InquiryBuyerAcknowledgement = {
  id: string
  buyer_email: string
  currency: string
  initial_offer_amount_minor: number | null
  seller_notification_status: string
  listings: { id: string; title: string } | Array<{ id: string; title: string }> | null
}

type BuyerEarlyAccessCheckoutRecovery = {
  intent_id: string
  user_id: string
  buyer_email: string
  source: 'signup' | 'pricing' | 'dashboard'
  created_at: string
}

type AcceptedSellerFollowup = {
  entity_id: string
  accepted_at: string
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
  const sellerEscalationCutoff = getSellerEnquiryEscalationCutoff()
  const nowIso = new Date().toISOString()
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const [inquiryResult, quoteResult, buyerResponseQuoteResult, premiumListingResult, sellerAssistanceResult, buyerAcknowledgementRetryResult, buyerEarlyAccessRecoveryResult, acceptedSellerFollowupResult] = await Promise.all([
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
    supabase
      .from('quote_requests')
      .select('id,status,updated_at')
      .eq('status', 'BUYER_RESPONDED')
      .lte('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(100),
    supabase
      .from('listings')
      .select('id,seller_id,title,contact_email,status,created_at')
      .eq('status', 'PENDING_PAYMENT')
      .contains('details', { listing_plan: 'premium' })
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase
      .from('seller_assistance_requests')
      .select('id,status,last_activity_at')
      .eq('status', 'NEW')
      .lte('last_activity_at', cutoff)
      .order('last_activity_at', { ascending: true })
      .limit(100),
    supabase
      .from('commercial_notification_receipts')
      .select('notification_type,entity_id')
      .in('notification_type', ['new_balloon_buyer_ack', 'inquiry_buyer_ack'])
      .in('status', ['pending', 'failed'])
      .lt('delivery_attempts', 2)
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase.rpc('due_buyer_early_access_checkout_recoveries', { p_cutoff: cutoff }),
    supabase
      .from('commercial_notification_receipts')
      .select('entity_id,accepted_at')
      .eq('notification_type', 'inquiry_seller_followup')
      .eq('status', 'accepted')
      .lte('accepted_at', sellerEscalationCutoff)
      .order('accepted_at', { ascending: true })
      .limit(100),
  ])
  if (inquiryResult.error || quoteResult.error || buyerResponseQuoteResult.error || premiumListingResult.error || sellerAssistanceResult.error || buyerAcknowledgementRetryResult.error || buyerEarlyAccessRecoveryResult.error || acceptedSellerFollowupResult.error) {
    return NextResponse.json({ error: 'Open opportunities could not be loaded' }, { status: 500 })
  }

  const inquiries = (inquiryResult.data || []) as unknown as Inquiry[]
  const quotes = quoteResult.data || []
  const buyerResponseQuotes = buyerResponseQuoteResult.data || []
  const premiumListings = (premiumListingResult.data || []) as PremiumListingRecovery[]
  const sellerAssistance = (sellerAssistanceResult.data || []) as SellerAssistance[]
  const buyerAcknowledgementRetries = (buyerAcknowledgementRetryResult.data || []) as BuyerAcknowledgementRetry[]
  const buyerEarlyAccessRecoveries = (buyerEarlyAccessRecoveryResult.data || []) as BuyerEarlyAccessCheckoutRecovery[]
  const acceptedSellerFollowups = (acceptedSellerFollowupResult.data || []) as AcceptedSellerFollowup[]
  const sellerEscalationInquiryIds = new Set(acceptedSellerFollowups.map((receipt) => receipt.entity_id))
  const sellerEnquiryEscalations = inquiries.filter((inquiry) => sellerEscalationInquiryIds.has(inquiry.id))
  const newBalloonBuyerAcknowledgementRetries = buyerAcknowledgementRetries.filter((retry) => retry.notification_type === 'new_balloon_buyer_ack')
  const inquiryBuyerAcknowledgementRetries = buyerAcknowledgementRetries.filter((retry) => retry.notification_type === 'inquiry_buyer_ack')
  const buyerAcknowledgementQuoteIds = [...new Set(newBalloonBuyerAcknowledgementRetries.map((retry) => retry.entity_id))]
  const buyerAcknowledgementInquiryIds = [...new Set(inquiryBuyerAcknowledgementRetries.map((retry) => retry.entity_id))]
  const [buyerAcknowledgementQuotesResult, buyerAcknowledgementInquiriesResult] = await Promise.all([
    buyerAcknowledgementQuoteIds.length > 0
      ? supabase
        .from('quote_requests')
        .select('id,email,manufacturer_preference,equipment_type')
        .in('id', buyerAcknowledgementQuoteIds)
      : Promise.resolve({ data: [], error: null }),
    buyerAcknowledgementInquiryIds.length > 0
      ? supabase
        .from('marketplace_inquiries')
        .select('id,buyer_email,currency,initial_offer_amount_minor,seller_notification_status,listings(id,title)')
        .in('id', buyerAcknowledgementInquiryIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (buyerAcknowledgementQuotesResult.error || buyerAcknowledgementInquiriesResult.error) {
    return NextResponse.json({ error: 'Buyer acknowledgement recovery data could not be loaded' }, { status: 500 })
  }
  const buyerAcknowledgementQuoteById = new Map(
    ((buyerAcknowledgementQuotesResult.data || []) as NewBalloonQuote[]).map((quote) => [quote.id, quote]),
  )
  const buyerAcknowledgementInquiryById = new Map(
    ((buyerAcknowledgementInquiriesResult.data || []) as unknown as InquiryBuyerAcknowledgement[]).map((inquiry) => [inquiry.id, inquiry]),
  )
  const result = {
    dueSellerEnquiries: inquiries.length,
    dueSellerEnquiryEscalations: sellerEnquiryEscalations.length,
    dueNewBalloonQuotes: quotes.length,
    dueNewBalloonProposalResponses: buyerResponseQuotes.length,
    duePremiumListingCheckouts: premiumListings.length,
    dueSellerAssistance: sellerAssistance.length,
    dueNewBalloonBuyerAcknowledgementRetries: newBalloonBuyerAcknowledgementRetries.length,
    dueMarketplaceInquiryBuyerAcknowledgementRetries: inquiryBuyerAcknowledgementRetries.length,
    dueBuyerEarlyAccessCheckoutRecoveries: buyerEarlyAccessRecoveries.length,
    accepted: 0,
    alreadyAccepted: 0,
    retryDeferred: 0,
    failed: 0,
    configurationBlocked: 0,
    dryRun: !commit,
  }
  if (!commit) return NextResponse.json(result)

  for (const retry of inquiryBuyerAcknowledgementRetries) {
    const inquiry = buyerAcknowledgementInquiryById.get(retry.entity_id)
    const listing = Array.isArray(inquiry?.listings) ? inquiry.listings[0] : inquiry?.listings
    if (!inquiry?.buyer_email || !listing?.id || !listing.title) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const buyerPortalToken = signInquiryBuyerPortalCapability({
        inquiryId: inquiry.id,
        buyerEmail: inquiry.buyer_email,
        expiresAt: new Date(Date.now() + inquiryBuyerPortalCapabilityLifetimeMs),
        secret: serviceRoleKey,
      })
      const buyerPortalUrl = buyerPortalToken
        ? `${siteUrl}/inquiry/status?id=${encodeURIComponent(inquiry.id)}&token=${encodeURIComponent(buyerPortalToken)}`
        : null
      const indicativeOffer = inquiry.initial_offer_amount_minor === null
        ? null
        : (inquiry.initial_offer_amount_minor / 100).toLocaleString('en-IE', { style: 'currency', currency: inquiry.currency })
      const acknowledgement = buildInquiryBuyerAcknowledgement({
        listingTitle: listing.title,
        listingUrl: `${siteUrl}/catalog/${listing.id}`,
        buyerPortalUrl,
        indicativeOffer,
        sellerDeliveryAccepted: inquiry.seller_notification_status === 'accepted',
      })
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'inquiry_buyer_ack',
        entityType: 'inquiry',
        entityId: inquiry.id,
        recipientRole: 'buyer',
        to: inquiry.buyer_email,
        subject: acknowledgement.subject,
        html: acknowledgement.html,
        idempotencyKey: `inquiry-buyer-ack-${inquiry.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else if (delivery.skipped) result.retryDeferred += 1
      else result.failed += 1
    } catch (error) {
      console.error('Marketplace enquiry buyer acknowledgement retry failed:', error)
      result.failed += 1
    }
  }

  for (const retry of newBalloonBuyerAcknowledgementRetries) {
    const quote = buyerAcknowledgementQuoteById.get(retry.entity_id)
    if (!quote?.email) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const acknowledgement = buildNewBalloonBuyerAcknowledgement(quote, siteUrl)
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'new_balloon_buyer_ack',
        entityType: 'quote_request',
        entityId: quote.id,
        recipientRole: 'buyer',
        to: quote.email,
        subject: acknowledgement.subject,
        html: acknowledgement.html,
        idempotencyKey: `new-balloon-buyer-ack-${quote.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else if (delivery.skipped) result.retryDeferred += 1
      else result.failed += 1
    } catch (error) {
      console.error('New-balloon buyer acknowledgement retry failed:', error)
      result.failed += 1
    }
  }

  for (const intent of buyerEarlyAccessRecoveries) {
    if (!intent.buyer_email) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'buyer_early_access_checkout_recovery',
        entityType: 'premium_checkout_intent',
        entityId: intent.intent_id,
        recipientRole: 'buyer',
        to: intent.buyer_email,
        subject: `Resume your ${buyerEarlyAccessProduct.publicName} checkout`,
        html: `<h2>Your Buyer Early Access checkout expired</h2>
        <p>AeroTrade has no verified Buyer Early Access payment from the checkout you started. Your account remains active.</p>
        <p>If you still want 48-hour early access and instant listing alerts for 9.99 EUR per year, <a href="${escapeHtml(`${siteUrl}/dashboard`)}">sign in to your dashboard and choose Get Buyer Early Access</a>.</p>
        <p>This email creates no checkout and makes no charge. A new Stripe checkout is created only after you choose to continue from your dashboard. You can ignore this message if you no longer want Buyer Early Access.</p>
        <p>This is the only recovery reminder for this expired checkout.</p>`,
        idempotencyKey: `buyer-early-access-checkout-recovery-${intent.intent_id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else if (delivery.skipped) result.retryDeferred += 1
      else result.failed += 1
    } catch (error) {
      console.error('Buyer Early Access checkout recovery failed:', error)
      result.failed += 1
    }
  }

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
  for (const inquiry of sellerEnquiryEscalations) {
    if (!adminEmail) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'inquiry_seller_escalation',
        entityType: 'inquiry',
        entityId: inquiry.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: 'AeroTrade: seller response overdue after reminder',
        html: `<h2>A marketplace enquiry needs manual recovery</h2>
        <p>The seller has not advanced an open buyer enquiry at least 48 hours after AeroTrade received provider acceptance for the single seller reminder.</p>
        <p><a href="${escapeHtml(`${siteUrl}/admin/commercial#inquiry-${inquiry.id}`)}">Open this enquiry in the commercial pipeline</a> and decide whether to contact the seller manually.</p>
        <p>This internal escalation sends nothing to the buyer, makes no promise and performs no reservation, payment or contract action.</p>`,
        idempotencyKey: `inquiry-seller-escalation-${inquiry.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else if (delivery.skipped) result.retryDeferred += 1
      else result.failed += 1
    } catch (error) {
      console.error('Seller enquiry escalation failed:', error)
      result.failed += 1
    }
  }

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

  for (const quote of buyerResponseQuotes) {
    if (!adminEmail) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'new_balloon_proposal_response_followup',
        entityType: 'quote_request',
        entityId: quote.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: 'AeroTrade: buyer response awaiting action',
        html: `<h2>A new-balloon buyer response still needs action</h2>
        <p>The buyer responded to an indicative Pasha or Schroeder proposal more than 24 hours ago, but the opportunity is still in BUYER_RESPONDED.</p>
        <p><a href="${escapeHtml(`${siteUrl}/admin/commercial`)}">Open the commercial pipeline and record the next action</a>.</p>
        <p>This is one operational reminder. It does not create an order, reservation, payment or contract.</p>`,
        idempotencyKey: `new-balloon-proposal-response-followup-${quote.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else result.failed += 1
    } catch (error) {
      console.error('New-balloon proposal response follow-up failed:', error)
      result.failed += 1
    }
  }

  for (const listing of premiumListings) {
    if (!listing.contact_email) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'premium_listing_checkout_recovery',
        entityType: 'listing',
        entityId: listing.id,
        recipientRole: 'seller',
        to: listing.contact_email,
        subject: 'AeroTrade: your Seller Launch Promotion checkout is incomplete',
        html: `<h2>Your listing is safely stored</h2>
        <p><strong>${escapeHtml(listing.title)}</strong> is still not public because its one-time Seller Launch Promotion checkout has not completed.</p>
        <p><a href="${escapeHtml(`${siteUrl}/dashboard`)}">Open your AeroTrade dashboard</a> to continue the 5 EUR promotion checkout or publish the listing using the free option.</p>
        <p>No new account or duplicate listing is required. This is a single operational reminder.</p>`,
        idempotencyKey: `premium-listing-checkout-recovery-${listing.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else result.failed += 1

      if (delivery.success) {
        await persistSellerFunnelEvent(supabase, {
          sellerId: listing.seller_id,
          listingId: listing.id,
          listingPlan: 'premium',
          stage: 'CHECKOUT_RECOVERY_SENT',
          source: 'recovery',
        })
      }
    } catch (error) {
      console.error('Premium listing checkout recovery failed:', error)
      result.failed += 1
    }
  }

  for (const request of sellerAssistance) {
    if (!adminEmail) {
      result.configurationBlocked += 1
      continue
    }
    try {
      const delivery = await sendCommercialReceiptEmail(supabase, {
        notificationType: 'seller_assistance_admin_followup',
        entityType: 'seller_assistance',
        entityId: request.id,
        recipientRole: 'admin',
        to: adminEmail,
        subject: 'AeroTrade: assisted seller is still awaiting review',
        html: `<h2>An assisted-sale opportunity still needs attention</h2>
        <p>A private seller request has remained in NEW status for more than 24 hours.</p>
        <p><a href="${escapeHtml(`${siteUrl}/admin/commercial`)}">Open the existing commercial pipeline and record the next action</a>.</p>`,
        idempotencyKey: `seller-assistance-admin-followup-${request.id}`,
      })
      if (delivery.duplicate) result.alreadyAccepted += 1
      else if (delivery.success) result.accepted += 1
      else result.failed += 1
    } catch (error) {
      console.error('Seller-assistance follow-up failed:', error)
      result.failed += 1
    }
  }

  const hasFailure = result.failed > 0 || result.configurationBlocked > 0
  return NextResponse.json(result, { status: hasFailure ? 502 : 200 })
}
