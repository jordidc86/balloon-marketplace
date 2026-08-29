import { createAdminClient } from '@/utils/supabase/server'
import { CircleDollarSign, CreditCard, MessageSquare, Plane, Store, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { listingMatchesWantedRequest } from '@/utils/wanted-request.mjs'
import { recordCommercialOutcome, updateAdminInquiryStatus, updateQuoteRequestStatus, updateSellerAssistanceStatus, updateWantedRequestStatus } from '../actions'

export const dynamic = 'force-dynamic'

type Inquiry = {
  id: string
  buyer_name: string
  buyer_email: string
  currency: string
  initial_offer_amount_minor: number | null
  status: string
  seller_notification_status: string
  created_at: string
  last_activity_at: string
  journey_key: string | null
  listings: { title: string } | null
}

type NegotiationEvent = {
  id: string
  inquiry_id: string
  event_type: 'BUYER_OFFERED' | 'SELLER_ACCEPTED_FOR_NEGOTIATION' | 'SELLER_COUNTERED' | 'SELLER_DECLINED'
  actor_role: 'BUYER' | 'SELLER' | 'ADMIN'
  amount_minor: number | null
  currency: string
  buyer_notification_status: 'pending' | 'accepted' | 'failed' | 'not_required'
  created_at: string
}

type Quote = {
  id: string
  name: string
  email: string
  equipment_type: string
  source_context: string
  status: string
  created_at: string
  journey_key: string | null
}

type WantedRequest = {
  id: string
  buyer_name: string
  buyer_email: string
  buyer_phone: string | null
  category: string
  location_preference: string | null
  currency: string
  budget_min_minor: number | null
  budget_max_minor: number | null
  details: string
  notify_on_match: boolean
  status: string
  created_at: string
  journey_key: string | null
}

type MatchableListing = {
  id: string
  title: string
  category: string
  status: string
  currency: string
  price: number
}

type WantedMatchDispatch = {
  id: string
  wanted_request_id: string
  listing_ids: string[]
  status: 'PENDING' | 'ACCEPTED' | 'FAILED' | 'CANCELLED'
  accepted_at: string | null
  updated_at: string
}

type CatalogSearchEvent = {
  id: string
  query_text: string | null
  category: string | null
  country: string | null
  result_count: number
  zero_results: boolean
  utm_source: string | null
  journey_key: string | null
  created_at: string
}

type ListingEvent = {
  event_type: 'VIEW' | 'CONTACT_REVEAL' | string
  journey_key: string | null
  created_at: string
}

type SellerFunnelEvent = {
  id: string
  seller_id: string
  listing_id: string | null
  stage: string
  listing_plan: string | null
  source: string
  created_at: string
}

type SellerPipelineListing = {
  id: string
  seller_id: string
  title: string
  status: string
  contact_email: string
  created_at: string
  updated_at: string
}

type SellerUser = {
  id: string
  email: string
}

type SellerAssistance = {
  id: string
  seller_user_id: string | null
  linked_listing_id: string | null
  name: string
  email: string
  phone: string | null
  category: string
  manufacturer: string | null
  model: string | null
  manufacture_year: number | null
  location_country: string | null
  expected_price_minor: number | null
  currency: string
  documentation_readiness: string
  photo_readiness: string
  timeline: string
  help_needed: string[]
  notes: string | null
  status: string
  created_at: string
  last_activity_at: string
}

type CommercialNotification = {
  id: string
  notification_type: string
  entity_type: string
  entity_id: string
  status: string
  created_at: string
}

type CommercialOutcome = {
  id: string
  entity_type: 'marketplace_inquiry' | 'quote_request'
  entity_id: string
  outcome_type: string
  currency: string
  gross_amount_minor: number
  aerotrade_revenue_minor: number
  evidence_level: string
  notes: string | null
  closed_at: string
}

type IndexingSubmissionReceipt = {
  id: string
  provider: 'INDEXNOW'
  url_count: number
  status: 'PENDING' | 'ACCEPTED' | 'FAILED'
  attempts: number
  provider_status_code: number | null
  attempted_at: string | null
  accepted_at: string | null
}

const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Madrid',
}).format(new Date(value))

const openInquiryStatuses = ['NEW', 'SELLER_NOTIFIED', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING']

export default async function CommercialPage() {
  const supabase = await createAdminClient()
  // This is a force-dynamic server component; the cutoff is intentionally evaluated per request.
  // eslint-disable-next-line react-hooks/purity
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString()
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const [{ data: inquiries, error: inquiriesError }, { data: negotiationEvents, error: negotiationEventsError }, { data: quotes, error: quotesError }, { data: wantedRequests, error: wantedError }, { data: wantedMatchDispatches, error: wantedMatchDispatchError }, { data: matchableListings }, { data: searchEvents, error: searchEventsError }, { data: sellerFunnelEvents, error: sellerFunnelError }, { data: sellerPipelineListings, error: sellerListingsError }, { data: sellerUsers, error: sellerUsersError }, { data: sellerAssistance, error: sellerAssistanceError }, { data: receipts }, { data: events }, { data: notifications, error: notificationsError }, { data: outcomes, error: outcomesError }, { data: indexingReceipts, error: indexingError }] = await Promise.all([
    supabase.from('marketplace_inquiries').select('id,buyer_name,buyer_email,currency,initial_offer_amount_minor,status,seller_notification_status,created_at,last_activity_at,journey_key,listings(title)').order('created_at', { ascending: false }).limit(100),
    supabase.from('marketplace_inquiry_offer_events').select('id,inquiry_id,event_type,actor_role,amount_minor,currency,buyer_notification_status,created_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('quote_requests').select('id,name,email,equipment_type,source_context,status,created_at,journey_key').order('created_at', { ascending: false }).limit(100),
    supabase.from('wanted_requests').select('id,buyer_name,buyer_email,buyer_phone,category,location_preference,currency,budget_min_minor,budget_max_minor,details,notify_on_match,status,created_at,journey_key').order('created_at', { ascending: false }).limit(100),
    supabase.from('wanted_match_dispatches').select('id,wanted_request_id,listing_ids,status,accepted_at,updated_at').order('updated_at', { ascending: false }).limit(500),
    supabase.from('listings').select('id,title,category,status,currency,price').in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM']),
    supabase.from('catalog_search_events').select('id,query_text,category,country,result_count,zero_results,utm_source,journey_key,created_at').gte('created_at', thirtyDaysAgo).order('created_at', { ascending: false }).limit(500),
    supabase.from('seller_funnel_events').select('id,seller_id,listing_id,stage,listing_plan,source,created_at').gte('created_at', thirtyDaysAgo).order('created_at', { ascending: false }).limit(500),
    supabase.from('listings').select('id,seller_id,title,status,contact_email,created_at,updated_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('users').select('id,email').limit(500),
    supabase.from('seller_assistance_requests').select('id,seller_user_id,linked_listing_id,name,email,phone,category,manufacturer,model,manufacture_year,location_country,expected_price_minor,currency,documentation_readiness,photo_readiness,timeline,help_needed,notes,status,created_at,last_activity_at').order('created_at', { ascending: false }).limit(200),
    supabase.from('payment_notification_receipts').select('payment_type,livemode,amount_minor,currency,accepted_at').order('accepted_at', { ascending: false }).limit(100),
    supabase.from('listing_events').select('event_type,journey_key,created_at').gte('created_at', thirtyDaysAgo),
    supabase.from('commercial_notification_receipts').select('id,notification_type,entity_type,entity_id,status,created_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('commercial_outcomes').select('id,entity_type,entity_id,outcome_type,currency,gross_amount_minor,aerotrade_revenue_minor,evidence_level,notes,closed_at').order('closed_at', { ascending: false }).limit(200),
    supabase.from('indexing_submission_receipts').select('id,provider,url_count,status,attempts,provider_status_code,attempted_at,accepted_at').order('created_at', { ascending: false }).limit(10),
  ])

  const typedInquiries = (inquiries || []) as unknown as Inquiry[]
  const typedNegotiationEvents = (negotiationEvents || []) as NegotiationEvent[]
  const typedQuotes = (quotes || []) as Quote[]
  const typedWantedRequests = (wantedRequests || []) as WantedRequest[]
  const typedWantedMatchDispatches = (wantedMatchDispatches || []) as WantedMatchDispatch[]
  const typedMatchableListings = (matchableListings || []) as MatchableListing[]
  const typedSearchEvents = (searchEvents || []) as CatalogSearchEvent[]
  const typedSellerFunnelEvents = (sellerFunnelEvents || []) as SellerFunnelEvent[]
  const typedSellerPipelineListings = (sellerPipelineListings || []) as SellerPipelineListing[]
  const typedSellerUsers = (sellerUsers || []) as SellerUser[]
  const typedSellerAssistance = (sellerAssistance || []) as SellerAssistance[]
  const typedNotifications = (notifications || []) as CommercialNotification[]
  const typedListingEvents = (events || []) as ListingEvent[]
  const negotiationEventsByInquiry = typedNegotiationEvents.reduce<Map<string, NegotiationEvent[]>>((byInquiry, event) => {
    const inquiryEvents = byInquiry.get(event.inquiry_id) || []
    inquiryEvents.push(event)
    byInquiry.set(event.inquiry_id, inquiryEvents)
    return byInquiry
  }, new Map())
  const wantedDispatchesByRequest = typedWantedMatchDispatches.reduce<Map<string, WantedMatchDispatch[]>>((byRequest, dispatch) => {
    const rows = byRequest.get(dispatch.wanted_request_id) || []
    rows.push(dispatch)
    byRequest.set(dispatch.wanted_request_id, rows)
    return byRequest
  }, new Map())
  const premiumRecoveryByListing = new Map(typedNotifications
    .filter((notification) => notification.notification_type === 'premium_listing_checkout_recovery')
    .map((notification) => [notification.entity_id, notification.status]))
  const typedOutcomes = (outcomes || []) as CommercialOutcome[]
  const typedIndexingReceipts = (indexingReceipts || []) as IndexingSubmissionReceipt[]
  const latestIndexingReceipt = typedIndexingReceipts[0]
  const outcomesByEntity = new Map(typedOutcomes.map((outcome) => [`${outcome.entity_type}:${outcome.entity_id}`, outcome]))
  const views = typedListingEvents.filter((event) => event.event_type === 'VIEW').length
  const reveals = typedListingEvents.filter((event) => event.event_type === 'CONTACT_REVEAL').length
  const recentInquiries = typedInquiries.filter((inquiry) => inquiry.created_at >= thirtyDaysAgo)
  const recentQuotes = typedQuotes.filter((quote) => quote.created_at >= thirtyDaysAgo)
  const recentWanted = typedWantedRequests.filter((request) => request.created_at >= thirtyDaysAgo)
  const viewJourneyKeys = new Set(typedListingEvents.filter((event) => event.event_type === 'VIEW' && event.journey_key).map((event) => event.journey_key as string))
  const searchJourneyKeys = new Set(typedSearchEvents.filter((event) => event.journey_key).map((event) => event.journey_key as string))
  const revealJourneyKeys = new Set(typedListingEvents.filter((event) => event.event_type === 'CONTACT_REVEAL' && event.journey_key).map((event) => event.journey_key as string))
  const requestJourneyKeys = new Set([
    ...recentInquiries.map((inquiry) => inquiry.journey_key),
    ...recentWanted.map((request) => request.journey_key),
    ...recentQuotes.map((quote) => quote.journey_key),
  ].filter((key): key is string => Boolean(key)))
  const attributableJourneyKeys = new Set([
    ...viewJourneyKeys,
    ...searchJourneyKeys,
    ...revealJourneyKeys,
    ...requestJourneyKeys,
  ])
  const unattributedLegacyViews = typedListingEvents.filter((event) => event.event_type === 'VIEW' && !event.journey_key).length
  const openInquiries = typedInquiries.filter((inquiry) => openInquiryStatuses.includes(inquiry.status)).length
  const openWanted = typedWantedRequests.filter((request) => !['CLOSED', 'SPAM'].includes(request.status)).length
  const openSellerAssistance = typedSellerAssistance.filter((request) => !['LISTED', 'CLOSED', 'SPAM'].includes(request.status)).length
  const zeroResultSearches = typedSearchEvents.filter((event) => event.zero_results)
  const zeroDemandCounts = zeroResultSearches.reduce<Map<string, number>>((counts, event) => {
    const label = event.query_text || event.category || event.country || 'Unspecified catalog search'
    counts.set(label, (counts.get(label) || 0) + 1)
    return counts
  }, new Map())
  const topZeroDemand = [...zeroDemandCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
  const uniqueSellerStageCount = (stage: string) => new Set(typedSellerFunnelEvents.filter((event) => event.stage === stage).map((event) => event.seller_id)).size
  const uniqueListingStageCount = (stage: string) => new Set(typedSellerFunnelEvents.filter((event) => event.stage === stage).map((event) => event.listing_id).filter(Boolean)).size
  const pendingPaymentListings = typedSellerPipelineListings.filter((listing) => listing.status === 'PENDING_PAYMENT')
  const latestFormStartBySeller = typedSellerFunnelEvents
    .filter((event) => event.stage === 'FORM_STARTED')
    .reduce<Map<string, SellerFunnelEvent>>((latest, event) => {
      if (!latest.has(event.seller_id)) latest.set(event.seller_id, event)
      return latest
    }, new Map())
  const stalledFormStarts = [...latestFormStartBySeller.values()].filter((event) => {
    if (nowMs - new Date(event.created_at).getTime() < 24 * 60 * 60 * 1000) return false
    return !typedSellerPipelineListings.some((listing) => listing.seller_id === event.seller_id && listing.created_at >= event.created_at)
  })
  const sellerEmailById = new Map(typedSellerUsers.map((user) => [user.id, user.email]))
  const won = typedInquiries.filter((inquiry) => inquiry.status === 'WON').length + typedQuotes.filter((quote) => quote.status === 'WON').length
  const buyerOffers = typedNegotiationEvents.filter((event) => event.event_type === 'BUYER_OFFERED')
  const sellerNegotiationResponses = typedNegotiationEvents.filter((event) => event.actor_role !== 'BUYER')
  const failedBuyerResponseNotifications = sellerNegotiationResponses.filter((event) => event.buyer_notification_status === 'failed').length
  const failedNotifications = typedInquiries.filter((inquiry) => inquiry.seller_notification_status === 'failed').length
    + typedNotifications.filter((notification) => notification.status === 'failed').length
    + failedBuyerResponseNotifications
  const liveReceipts = (receipts || []).filter((receipt) => receipt.livemode)
  const liveGross = liveReceipts.reduce((sum, receipt) => receipt.currency === 'eur' ? sum + Number(receipt.amount_minor || 0) : sum, 0)
  const settledRevenueByCurrency = typedOutcomes
    .filter((outcome) => outcome.evidence_level === 'settled')
    .reduce<Record<string, number>>((totals, outcome) => {
      totals[outcome.currency] = (totals[outcome.currency] || 0) + Number(outcome.aerotrade_revenue_minor || 0)
      return totals
    }, {})
  const reportedGrossByCurrency = typedOutcomes.reduce<Record<string, number>>((totals, outcome) => {
    totals[outcome.currency] = (totals[outcome.currency] || 0) + Number(outcome.gross_amount_minor || 0)
    return totals
  }, {})

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Commercial Pipeline</h1>
        <p className="mt-1 text-muted-foreground">Evidence from interest to opportunity, outcome and verified payment notification.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Views (30d)" value={views} icon={<Plane className="h-5 w-5" />} detail={`${reveals} contact reveals · ${typedSearchEvents.length} catalog searches`} />
        <Metric title="Open opportunities" value={openInquiries + openWanted + openSellerAssistance + typedQuotes.filter((quote) => !['WON', 'LOST'].includes(quote.status)).length} icon={<MessageSquare className="h-5 w-5" />} detail={`${typedInquiries.length} enquiries · ${typedWantedRequests.length} wanted · ${typedQuotes.length} new balloon · ${typedSellerAssistance.length} assisted sellers`} />
        <Metric title="Won outcomes" value={won} icon={<CircleDollarSign className="h-5 w-5" />} detail="Recorded outcomes, not assumed sales" />
        <Metric title="Needs attention" value={failedNotifications} icon={<TriangleAlert className="h-5 w-5" />} detail="Seller emails not accepted" warning={failedNotifications > 0} />
      </div>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Buyer journey evidence (30d)</h2>
        <p className="mt-1 text-sm text-muted-foreground">Daily pseudonymous journey keys connect demand to contact or a request without exposing a browser identifier. Administrator and listing-owner activity is excluded from new buyer measurements.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FunnelStep label="Catalog search" value={searchJourneyKeys.size} />
          <FunnelStep label="Listing viewed" value={viewJourneyKeys.size} />
          <FunnelStep label="Contact revealed" value={revealJourneyKeys.size} />
          <FunnelStep label="Request sent" value={requestJourneyKeys.size} />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">{attributableJourneyKeys.size} attributable buyer journey(s). Each stage is a distinct journey count, not a claim that every visitor moved through every preceding step.</p>
        {unattributedLegacyViews > 0 ? <p className="mt-2 text-xs text-amber-700">{unattributedLegacyViews} older or unattributed listing view(s) remain visible but cannot be reconstructed into a journey.</p> : null}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Negotiation evidence</h2>
        <p className="mt-1 text-sm text-muted-foreground">A structured price indication is optional. Seller acceptances, counteroffers and declines are stored before notification and remain explicitly non-binding.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FunnelStep label="Tracked enquiries" value={typedInquiries.length} />
          <FunnelStep label="Buyer offers" value={buyerOffers.length} />
          <FunnelStep label="Seller responses" value={sellerNegotiationResponses.length} />
          <FunnelStep label="Buyer emails failed" value={failedBuyerResponseNotifications} />
        </div>
      </section>

      <div className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Revenue evidence</h2>
        <p className="mt-1 text-sm text-muted-foreground">{liveReceipts.length} live payment notification receipt(s) · {(liveGross / 100).toLocaleString('en-IE', { style: 'currency', currency: 'EUR' })} gross EUR represented. This is not net revenue.</p>
        <p className="mt-2 text-sm text-muted-foreground">{typedOutcomes.length} recorded commercial outcome(s) · gross outcomes {formatCurrencyTotals(reportedGrossByCurrency)} · settled AeroTrade revenue {formatCurrencyTotals(settledRevenueByCurrency)}.</p>
        <p className="mt-2 text-xs text-muted-foreground">Reported and documented outcomes are not counted as settled revenue. Stripe receipts and marketplace outcomes remain separate evidence sources.</p>
      </div>

      {notificationsError ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Commercial notification evidence unavailable: {notificationsError.message}</p> : null}
      {outcomesError ? <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">Commercial outcome evidence unavailable: {outcomesError.message}</p> : null}

      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-xl font-semibold">Catalog demand gaps (30d)</h2>
        <p className="mt-1 text-sm text-muted-foreground">{typedSearchEvents.length} deduplicated search(es) · {zeroResultSearches.length} with no matching inventory. Likely email, phone and URL searches are not retained.</p>
        {searchEventsError ? <p className="mt-4 text-sm text-destructive">Search-demand evidence unavailable: {searchEventsError.message}</p> : topZeroDemand.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">No zero-result demand has been recorded yet.</p> : <div className="mt-4 grid gap-2 sm:grid-cols-2">{topZeroDemand.map(([label, count]) => <div key={label} className="flex items-center justify-between rounded-lg border bg-muted/20 px-4 py-3 text-sm"><span className="font-medium">{label}</span><span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{count}</span></div>)}</div>}
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="text-xl font-semibold">Search discovery</h2><p className="mt-1 text-sm text-muted-foreground">The public sitemap remains authoritative. IndexNow submits only public commercial URLs and keeps aggregate provider evidence without retaining the submitted URL list.</p></div>
          <a href="/sitemap.xml" className="text-sm font-semibold text-primary underline">Open sitemap</a>
        </div>
        {indexingError ? <p className="mt-4 text-sm text-destructive">Indexing submission evidence is unavailable: {indexingError.message}</p> : !latestIndexingReceipt ? <p className="mt-4 text-sm text-muted-foreground">No public URL submission has run yet.</p> : (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <FunnelStep label="Latest URLs" value={latestIndexingReceipt.url_count} />
            <FunnelStep label="Attempts" value={latestIndexingReceipt.attempts} />
            <div className="rounded-xl border bg-muted/20 p-4"><p className="text-xs font-medium text-muted-foreground">Provider result</p><p className={`mt-2 text-lg font-bold ${latestIndexingReceipt.status === 'FAILED' ? 'text-destructive' : 'text-foreground'}`}>{latestIndexingReceipt.status}</p></div>
            <div className="rounded-xl border bg-muted/20 p-4"><p className="text-xs font-medium text-muted-foreground">Last evidence</p><p className="mt-2 text-sm font-bold">{latestIndexingReceipt.accepted_at ? formatDate(latestIndexingReceipt.accepted_at) : latestIndexingReceipt.attempted_at ? formatDate(latestIndexingReceipt.attempted_at) : 'Not attempted'}</p></div>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">IndexNow supports participating search engines; it does not prove Google indexing. Search Console ownership remains a separate external setup step.</p>
      </section>

      <section className="rounded-2xl border bg-card p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div><h2 className="text-xl font-semibold">Seller activation (30d)</h2><p className="mt-1 text-sm text-muted-foreground">Private, account-linked funnel evidence. It starts collecting from this release and never stores passwords, card data, IP addresses or draft form text.</p></div>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary"><Store className="h-4 w-4" />No automatic outreach</span>
        </div>
        {sellerFunnelError || sellerListingsError || sellerUsersError ? <p className="mt-4 text-sm text-destructive">Seller-activation evidence is incomplete.</p> : (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <FunnelStep label="Sell page" value={uniqueSellerStageCount('SELL_PAGE_VIEWED')} />
              <FunnelStep label="Form started" value={uniqueSellerStageCount('FORM_STARTED')} />
              <FunnelStep label="Submitted" value={uniqueListingStageCount('LISTING_SUBMITTED')} />
              <FunnelStep label="Checkout" value={uniqueListingStageCount('CHECKOUT_CREATED')} />
              <FunnelStep label="Paid" value={uniqueListingStageCount('PAYMENT_CONFIRMED')} />
              <FunnelStep label="Published" value={uniqueListingStageCount('LISTING_PUBLISHED')} />
            </div>
            <div className="mt-6 rounded-xl border bg-muted/20">
              <div className="border-b px-4 py-3"><h3 className="font-semibold">Recovery queue</h3><p className="text-xs text-muted-foreground">Only evidence-backed interruptions are shown. Contact remains a manual decision.</p></div>
              {pendingPaymentListings.length === 0 && stalledFormStarts.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No seller activation interruption currently needs review.</p> : (
                <div className="divide-y">
                  {pendingPaymentListings.map((listing) => {
                    const recoveryStatus = premiumRecoveryByListing.get(listing.id)
                    return <div key={listing.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Premium payment incomplete · {listing.title}</p><p className="text-xs text-muted-foreground">Stored {formatDate(listing.created_at)} · seller can resume securely from their dashboard.</p>{recoveryStatus ? <p className={`mt-1 text-xs font-semibold ${recoveryStatus === 'failed' ? 'text-destructive' : 'text-emerald-700'}`}>Automatic recovery: {recoveryStatus}</p> : null}</div>{recoveryStatus === 'accepted' ? <span className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700"><CreditCard className="h-4 w-4" />Reminder accepted</span> : <a href={`mailto:${listing.contact_email}`} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted"><CreditCard className="h-4 w-4" />Contact manually</a>}</div>
                  })}
                  {stalledFormStarts.map((event) => <div key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Listing form started but no later submission</p><p className="text-xs text-muted-foreground">Last start {formatDate(event.created_at)} · no listing created afterwards.</p></div>{sellerEmailById.get(event.seller_id) ? <a href={`mailto:${sellerEmailById.get(event.seller_id)}`} className="rounded-lg border px-3 py-2 text-center text-sm font-semibold hover:bg-muted">Contact manually</a> : null}</div>)}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Assisted seller pipeline</h2><p className="mt-1 text-sm text-muted-foreground">Private owner requests that reduce listing abandonment. Nothing here is public; LISTED must point to the completed normal marketplace listing.</p></div>
        {sellerAssistanceError ? <p className="p-6 text-destructive">Assisted-sale pipeline unavailable: {sellerAssistanceError.message}</p> : typedSellerAssistance.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No assisted-sale requests yet.</p> : (
          <div className="divide-y">
            {typedSellerAssistance.map((request) => {
              const candidates = typedSellerPipelineListings.filter((listing) => (
                (request.seller_user_id && listing.seller_id === request.seller_user_id)
                || listing.contact_email.trim().toLowerCase() === request.email.trim().toLowerCase()
              ))
              const expectedPrice = request.expected_price_minor === null
                ? 'Price not specified'
                : (request.expected_price_minor / 100).toLocaleString('en-IE', { style: 'currency', currency: request.currency })
              return (
                <div key={request.id} className="grid gap-4 p-6 lg:grid-cols-[1.2fr_1fr_auto] lg:items-start">
                  <div><p className="font-semibold">{request.name} · {[request.manufacturer, request.model].filter(Boolean).join(' ') || request.category}</p><a href={`mailto:${request.email}`} className="text-sm text-primary hover:underline">{request.email}</a>{request.phone ? <p className="text-sm">{request.phone}</p> : null}<p className="mt-1 text-xs text-muted-foreground">{formatDate(request.created_at)} · {request.location_country || 'Location not specified'} · {expectedPrice}</p>{request.notes ? <p className="mt-3 whitespace-pre-wrap text-sm">{request.notes}</p> : null}</div>
                  <div className="space-y-2 text-sm"><span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{request.status}</span><p>Documents: {request.documentation_readiness} · photos: {request.photo_readiness}</p><p>Timing: {request.timeline}</p><p className="text-xs text-muted-foreground">Help: {request.help_needed.length ? request.help_needed.join(', ') : 'not specified'}</p>{request.linked_listing_id ? <Link href={`/catalog/${request.linked_listing_id}`} className="block font-semibold text-primary underline">Open completed listing</Link> : null}</div>
                  <form action={updateSellerAssistanceStatus.bind(null, request.id)} className="grid min-w-64 gap-2">
                    <select name="status" defaultValue={request.status} className="rounded-lg border bg-background px-3 py-2 text-sm">{['NEW', 'CONTACTED', 'QUALIFIED', 'LISTING_PREPARATION', 'LISTED', 'CLOSED', 'SPAM'].map((status) => <option value={status} key={status}>{status}</option>)}</select>
                    <select name="linked_listing_id" defaultValue={request.linked_listing_id || ''} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="">No linked listing</option>{candidates.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {listing.status}</option>)}</select>
                    <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save & verify</button>
                  </form>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Buyer demand without a listing</h2><p className="mt-1 text-sm text-muted-foreground">Private wanted requests and basic matches against active supply. Consented buyers receive one deduplicated operational digest when new compatible listings appear.</p></div>
        {wantedMatchDispatchError ? <p className="border-b p-6 text-sm text-destructive">Wanted-match delivery evidence is unavailable: {wantedMatchDispatchError.message}</p> : null}
        {wantedError ? <p className="p-6 text-destructive">Wanted-demand pipeline unavailable: {wantedError.message}</p> : typedWantedRequests.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No tracked wanted-equipment requests yet.</p> : (
          <div className="divide-y">
            {typedWantedRequests.map((request) => {
              const matches = typedMatchableListings.filter((listing) => listingMatchesWantedRequest(listing, request))
              const budget = request.budget_min_minor === null && request.budget_max_minor === null
                ? 'Budget not specified'
                : `${request.budget_min_minor === null ? '0' : (request.budget_min_minor / 100).toLocaleString('en-IE')}–${request.budget_max_minor === null ? 'open' : (request.budget_max_minor / 100).toLocaleString('en-IE')} ${request.currency}`
              const matchDispatches = wantedDispatchesByRequest.get(request.id) || []
              const acceptedDispatches = matchDispatches.filter((dispatch) => dispatch.status === 'ACCEPTED')
              const notifiedListings = acceptedDispatches.reduce((count, dispatch) => count + dispatch.listing_ids.length, 0)
              const failedDispatches = matchDispatches.filter((dispatch) => dispatch.status === 'FAILED').length
              return (
                <div key={request.id} className="grid gap-4 p-6 lg:grid-cols-[1.2fr_1fr_auto] lg:items-start">
                  <div><p className="font-semibold">{request.buyer_name} · {request.category}</p><a href={`mailto:${request.buyer_email}`} className="text-sm text-primary hover:underline">{request.buyer_email}</a><p className="mt-1 text-xs text-muted-foreground">{formatDate(request.created_at)} · {request.location_preference || 'No location preference'} · {budget}</p><p className="mt-3 whitespace-pre-wrap text-sm">{request.details}</p></div>
                  <div className="space-y-2 text-sm"><span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{request.status}</span><p>{request.notify_on_match ? 'Buyer consented to match email.' : 'No match-email consent.'}</p><p className="font-semibold">{matches.length} basic catalog match(es)</p><p className="text-xs text-muted-foreground">{notifiedListings} listing alert(s) accepted by provider · {failedDispatches} failed digest(s)</p>{matches.slice(0, 3).map((listing) => <Link key={listing.id} href={`/catalog/${listing.id}`} className="block text-primary hover:underline">{listing.title}</Link>)}{matches.length > 3 ? <p className="text-xs text-muted-foreground">+{matches.length - 3} more</p> : null}</div>
                  <form action={updateWantedRequestStatus.bind(null, request.id)} className="flex gap-2"><select name="status" defaultValue={request.status} className="rounded-lg border bg-background px-3 py-2 text-sm">{['NEW', 'REVIEWING', 'MATCHED', 'CONTACTED', 'CLOSED', 'SPAM'].map((status) => <option value={status} key={status}>{status}</option>)}</select><button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save</button></form>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Marketplace enquiries</h2><p className="mt-1 text-sm text-muted-foreground">Structured offers and seller responses are non-binding commercial evidence; they never reserve equipment or execute payment.</p></div>
        {inquiriesError || negotiationEventsError ? <p className="p-6 text-destructive">Pipeline unavailable: {inquiriesError?.message || negotiationEventsError?.message}</p> : typedInquiries.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No tracked enquiries yet.</p> : (
          <div className="divide-y">
            {typedInquiries.map((inquiry) => {
              const inquiryNegotiationEvents = negotiationEventsByInquiry.get(inquiry.id) || []
              const latestNegotiationEvent = inquiryNegotiationEvents[0]
              const displayAmount = latestNegotiationEvent?.amount_minor
                ? (Number(latestNegotiationEvent.amount_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: latestNegotiationEvent.currency })
                : null
              return <div key={inquiry.id} className="grid gap-4 p-6 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
                <div>
                  <p className="font-semibold">{inquiry.buyer_name} · {inquiry.listings?.title || 'Listing'}</p>
                  <a href={`mailto:${inquiry.buyer_email}`} className="text-sm text-primary hover:underline">{inquiry.buyer_email}</a>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(inquiry.created_at)}</p>
                  {latestNegotiationEvent ? <p className="mt-2 text-sm font-medium">Latest negotiation: {latestNegotiationEvent.event_type.replaceAll('_', ' ').toLowerCase()}{displayAmount ? ` · ${displayAmount}` : ''}</p> : <p className="mt-2 text-xs text-muted-foreground">No structured offer or response yet.</p>}
                </div>
                <div className="text-sm">
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{inquiry.status}</span>
                  {inquiry.seller_notification_status === 'failed' ? <p className="mt-2 text-destructive">Seller email not accepted; lead remains visible.</p> : null}
                  {latestNegotiationEvent && latestNegotiationEvent.actor_role !== 'BUYER' ? <p className={`mt-2 text-xs ${latestNegotiationEvent.buyer_notification_status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>Buyer response email: {latestNegotiationEvent.buyer_notification_status}</p> : null}
                </div>
                <form action={updateAdminInquiryStatus.bind(null, inquiry.id)} className="flex gap-2">
                  <select name="status" defaultValue={inquiry.status} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    {['NEW', 'SELLER_NOTIFIED', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'WON', 'LOST', 'SPAM'].map((status) => <option value={status} key={status}>{status}</option>)}
                  </select>
                  <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save</button>
                </form>
                <div className="lg:col-span-3">
                  <OutcomeEditor entityType="marketplace_inquiry" entityId={inquiry.id} outcome={outcomesByEntity.get(`marketplace_inquiry:${inquiry.id}`)} />
                </div>
              </div>
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">New balloon opportunities</h2></div>
        {quotesError ? <p className="p-6 text-destructive">Quote pipeline unavailable: {quotesError.message}</p> : typedQuotes.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No new-balloon requests yet.</p> : (
          <div className="divide-y">
            {typedQuotes.map((quote) => (
              <div key={quote.id} className="grid gap-4 p-6 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
                <div><p className="font-semibold">{quote.name} · {quote.equipment_type}</p><a href={`mailto:${quote.email}`} className="text-sm text-primary hover:underline">{quote.email}</a><p className="mt-1 text-xs text-muted-foreground">Source: {quote.source_context} · {formatDate(quote.created_at)}</p></div>
                <span className="text-sm font-bold">{quote.status}</span>
                <form action={updateQuoteRequestStatus.bind(null, quote.id)} className="flex gap-2">
                  <select name="status" defaultValue={quote.status} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    {['NEW', 'CONTACTED', 'SENT_TO_PARTNER', 'QUOTE_SENT', 'WON', 'LOST'].map((status) => <option value={status} key={status}>{status}</option>)}
                  </select>
                  <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save</button>
                </form>
                <div className="lg:col-span-3">
                  <OutcomeEditor entityType="quote_request" entityId={quote.id} outcome={outcomesByEntity.get(`quote_request:${quote.id}`)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ title, value, detail, icon, warning = false }: { title: string; value: number; detail: string; icon: React.ReactNode; warning?: boolean }) {
  return <div className={`rounded-2xl border bg-card p-5 ${warning ? 'border-destructive/30' : ''}`}><div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">{title}</p><span className={warning ? 'text-destructive' : 'text-primary'}>{icon}</span></div><p className="mt-3 text-3xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}

function FunnelStep({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-background p-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>
}

function formatCurrencyTotals(totals: Record<string, number>) {
  const entries = Object.entries(totals)
  if (entries.length === 0) return 'none recorded'
  return entries.map(([currency, minor]) => (minor / 100).toLocaleString('en-IE', { style: 'currency', currency })).join(' · ')
}

function OutcomeEditor({ entityType, entityId, outcome }: {
  entityType: 'marketplace_inquiry' | 'quote_request'
  entityId: string
  outcome?: CommercialOutcome
}) {
  const amount = (minor?: number) => ((minor || 0) / 100).toFixed(2)
  return (
    <details className="rounded-xl border bg-muted/20">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        {outcome ? `Outcome: ${outcome.evidence_level} · ${amount(outcome.gross_amount_minor)} ${outcome.currency}` : 'Record commercial outcome'}
      </summary>
      <form action={recordCommercialOutcome.bind(null, entityType, entityId)} className="grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-6">
        <select name="outcome_type" defaultValue={outcome?.outcome_type || 'sale'} className="rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="sale">Sale</option><option value="intermediation">Intermediation</option><option value="other">Other</option>
        </select>
        <select name="currency" defaultValue={outcome?.currency || 'EUR'} className="rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="EUR">EUR</option><option value="GBP">GBP</option><option value="USD">USD</option>
        </select>
        <input name="gross_amount" required inputMode="decimal" defaultValue={amount(outcome?.gross_amount_minor)} placeholder="Gross amount" aria-label="Gross amount" className="rounded-lg border bg-background px-3 py-2 text-sm" />
        <input name="aerotrade_revenue" required inputMode="decimal" defaultValue={amount(outcome?.aerotrade_revenue_minor)} placeholder="AeroTrade revenue" aria-label="AeroTrade revenue" className="rounded-lg border bg-background px-3 py-2 text-sm" />
        <select name="evidence_level" defaultValue={outcome?.evidence_level || 'reported'} className="rounded-lg border bg-background px-3 py-2 text-sm">
          <option value="reported">Reported</option><option value="documented">Documented</option><option value="settled">Settled</option>
        </select>
        <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save outcome</button>
        <textarea name="outcome_notes" maxLength={2000} defaultValue={outcome?.notes || ''} placeholder="Evidence note (no passwords or card data)" className="min-h-20 rounded-lg border bg-background px-3 py-2 text-sm sm:col-span-2 lg:col-span-6" />
      </form>
    </details>
  )
}
