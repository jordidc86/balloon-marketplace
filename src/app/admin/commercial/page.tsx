import { createAdminClient } from '@/utils/supabase/server'
import { CircleDollarSign, CreditCard, MessageSquare, Plane, Store, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { listingMatchesWantedRequest } from '@/utils/wanted-request.mjs'
import { recordCommercialOutcome, updateAdminInquiryStatus, updateQuoteRequestStatus, updateWantedRequestStatus } from '../actions'

export const dynamic = 'force-dynamic'

type Inquiry = {
  id: string
  buyer_name: string
  buyer_email: string
  status: string
  seller_notification_status: string
  created_at: string
  last_activity_at: string
  listings: { title: string } | null
}

type Quote = {
  id: string
  name: string
  email: string
  equipment_type: string
  status: string
  created_at: string
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
}

type MatchableListing = {
  id: string
  title: string
  category: string
  status: string
  currency: string
  price: number
}

type CatalogSearchEvent = {
  id: string
  query_text: string | null
  category: string | null
  country: string | null
  result_count: number
  zero_results: boolean
  utm_source: string | null
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

type CommercialNotification = {
  id: string
  notification_type: string
  entity_type: string
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
  const [{ data: inquiries, error: inquiriesError }, { data: quotes, error: quotesError }, { data: wantedRequests, error: wantedError }, { data: matchableListings }, { data: searchEvents, error: searchEventsError }, { data: sellerFunnelEvents, error: sellerFunnelError }, { data: sellerPipelineListings, error: sellerListingsError }, { data: sellerUsers, error: sellerUsersError }, { data: receipts }, { data: events }, { data: notifications, error: notificationsError }, { data: outcomes, error: outcomesError }] = await Promise.all([
    supabase.from('marketplace_inquiries').select('id,buyer_name,buyer_email,status,seller_notification_status,created_at,last_activity_at,listings(title)').order('created_at', { ascending: false }).limit(100),
    supabase.from('quote_requests').select('id,name,email,equipment_type,status,created_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('wanted_requests').select('id,buyer_name,buyer_email,buyer_phone,category,location_preference,currency,budget_min_minor,budget_max_minor,details,notify_on_match,status,created_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('listings').select('id,title,category,status,currency,price').in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM']),
    supabase.from('catalog_search_events').select('id,query_text,category,country,result_count,zero_results,utm_source,created_at').gte('created_at', thirtyDaysAgo).order('created_at', { ascending: false }).limit(500),
    supabase.from('seller_funnel_events').select('id,seller_id,listing_id,stage,listing_plan,source,created_at').gte('created_at', thirtyDaysAgo).order('created_at', { ascending: false }).limit(500),
    supabase.from('listings').select('id,seller_id,title,status,contact_email,created_at,updated_at').order('created_at', { ascending: false }).limit(500),
    supabase.from('users').select('id,email').limit(500),
    supabase.from('payment_notification_receipts').select('payment_type,livemode,amount_minor,currency,accepted_at').order('accepted_at', { ascending: false }).limit(100),
    supabase.from('listing_events').select('event_type,created_at').gte('created_at', thirtyDaysAgo),
    supabase.from('commercial_notification_receipts').select('id,notification_type,entity_type,status,created_at').order('created_at', { ascending: false }).limit(100),
    supabase.from('commercial_outcomes').select('id,entity_type,entity_id,outcome_type,currency,gross_amount_minor,aerotrade_revenue_minor,evidence_level,notes,closed_at').order('closed_at', { ascending: false }).limit(200),
  ])

  const typedInquiries = (inquiries || []) as unknown as Inquiry[]
  const typedQuotes = (quotes || []) as Quote[]
  const typedWantedRequests = (wantedRequests || []) as WantedRequest[]
  const typedMatchableListings = (matchableListings || []) as MatchableListing[]
  const typedSearchEvents = (searchEvents || []) as CatalogSearchEvent[]
  const typedSellerFunnelEvents = (sellerFunnelEvents || []) as SellerFunnelEvent[]
  const typedSellerPipelineListings = (sellerPipelineListings || []) as SellerPipelineListing[]
  const typedSellerUsers = (sellerUsers || []) as SellerUser[]
  const typedNotifications = (notifications || []) as CommercialNotification[]
  const typedOutcomes = (outcomes || []) as CommercialOutcome[]
  const outcomesByEntity = new Map(typedOutcomes.map((outcome) => [`${outcome.entity_type}:${outcome.entity_id}`, outcome]))
  const views = (events || []).filter((event) => event.event_type === 'VIEW').length
  const reveals = (events || []).filter((event) => event.event_type === 'CONTACT_REVEAL').length
  const openInquiries = typedInquiries.filter((inquiry) => openInquiryStatuses.includes(inquiry.status)).length
  const openWanted = typedWantedRequests.filter((request) => !['CLOSED', 'SPAM'].includes(request.status)).length
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
  const failedNotifications = typedInquiries.filter((inquiry) => inquiry.seller_notification_status === 'failed').length
    + typedNotifications.filter((notification) => notification.status === 'failed').length
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
        <Metric title="Open opportunities" value={openInquiries + openWanted + typedQuotes.filter((quote) => !['WON', 'LOST'].includes(quote.status)).length} icon={<MessageSquare className="h-5 w-5" />} detail={`${typedInquiries.length} enquiries · ${typedWantedRequests.length} wanted · ${typedQuotes.length} new balloon`} />
        <Metric title="Won outcomes" value={won} icon={<CircleDollarSign className="h-5 w-5" />} detail="Recorded outcomes, not assumed sales" />
        <Metric title="Needs attention" value={failedNotifications} icon={<TriangleAlert className="h-5 w-5" />} detail="Seller emails not accepted" warning={failedNotifications > 0} />
      </div>

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
                  {pendingPaymentListings.map((listing) => <div key={listing.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Premium payment incomplete · {listing.title}</p><p className="text-xs text-muted-foreground">Stored {formatDate(listing.created_at)} · seller can now resume securely from their dashboard.</p></div><a href={`mailto:${listing.contact_email}`} className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted"><CreditCard className="h-4 w-4" />Contact manually</a></div>)}
                  {stalledFormStarts.map((event) => <div key={event.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">Listing form started but no later submission</p><p className="text-xs text-muted-foreground">Last start {formatDate(event.created_at)} · no listing created afterwards.</p></div>{sellerEmailById.get(event.seller_id) ? <a href={`mailto:${sellerEmailById.get(event.seller_id)}`} className="rounded-lg border px-3 py-2 text-center text-sm font-semibold hover:bg-muted">Contact manually</a> : null}</div>)}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Buyer demand without a listing</h2><p className="mt-1 text-sm text-muted-foreground">Private wanted requests and basic matches against active supply. No buyer email is sent automatically from this screen.</p></div>
        {wantedError ? <p className="p-6 text-destructive">Wanted-demand pipeline unavailable: {wantedError.message}</p> : typedWantedRequests.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No tracked wanted-equipment requests yet.</p> : (
          <div className="divide-y">
            {typedWantedRequests.map((request) => {
              const matches = typedMatchableListings.filter((listing) => listingMatchesWantedRequest(listing, request))
              const budget = request.budget_min_minor === null && request.budget_max_minor === null
                ? 'Budget not specified'
                : `${request.budget_min_minor === null ? '0' : (request.budget_min_minor / 100).toLocaleString('en-IE')}–${request.budget_max_minor === null ? 'open' : (request.budget_max_minor / 100).toLocaleString('en-IE')} ${request.currency}`
              return (
                <div key={request.id} className="grid gap-4 p-6 lg:grid-cols-[1.2fr_1fr_auto] lg:items-start">
                  <div><p className="font-semibold">{request.buyer_name} · {request.category}</p><a href={`mailto:${request.buyer_email}`} className="text-sm text-primary hover:underline">{request.buyer_email}</a><p className="mt-1 text-xs text-muted-foreground">{formatDate(request.created_at)} · {request.location_preference || 'No location preference'} · {budget}</p><p className="mt-3 whitespace-pre-wrap text-sm">{request.details}</p></div>
                  <div className="space-y-2 text-sm"><span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{request.status}</span><p>{request.notify_on_match ? 'Buyer consented to match email.' : 'No match-email consent.'}</p><p className="font-semibold">{matches.length} basic catalog match(es)</p>{matches.slice(0, 3).map((listing) => <Link key={listing.id} href={`/catalog/${listing.id}`} className="block text-primary hover:underline">{listing.title}</Link>)}{matches.length > 3 ? <p className="text-xs text-muted-foreground">+{matches.length - 3} more</p> : null}</div>
                  <form action={updateWantedRequestStatus.bind(null, request.id)} className="flex gap-2"><select name="status" defaultValue={request.status} className="rounded-lg border bg-background px-3 py-2 text-sm">{['NEW', 'REVIEWING', 'MATCHED', 'CONTACTED', 'CLOSED', 'SPAM'].map((status) => <option value={status} key={status}>{status}</option>)}</select><button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save</button></form>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">Marketplace enquiries</h2></div>
        {inquiriesError ? <p className="p-6 text-destructive">Pipeline unavailable: {inquiriesError.message}</p> : typedInquiries.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No tracked enquiries yet.</p> : (
          <div className="divide-y">
            {typedInquiries.map((inquiry) => (
              <div key={inquiry.id} className="grid gap-4 p-6 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
                <div>
                  <p className="font-semibold">{inquiry.buyer_name} · {inquiry.listings?.title || 'Listing'}</p>
                  <a href={`mailto:${inquiry.buyer_email}`} className="text-sm text-primary hover:underline">{inquiry.buyer_email}</a>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(inquiry.created_at)}</p>
                </div>
                <div className="text-sm">
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{inquiry.status}</span>
                  {inquiry.seller_notification_status === 'failed' ? <p className="mt-2 text-destructive">Seller email not accepted; lead remains visible.</p> : null}
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
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border bg-card overflow-hidden">
        <div className="border-b p-6"><h2 className="text-xl font-semibold">New balloon opportunities</h2></div>
        {quotesError ? <p className="p-6 text-destructive">Quote pipeline unavailable: {quotesError.message}</p> : typedQuotes.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No new-balloon requests yet.</p> : (
          <div className="divide-y">
            {typedQuotes.map((quote) => (
              <div key={quote.id} className="grid gap-4 p-6 lg:grid-cols-[1.3fr_1fr_auto] lg:items-center">
                <div><p className="font-semibold">{quote.name} · {quote.equipment_type}</p><a href={`mailto:${quote.email}`} className="text-sm text-primary hover:underline">{quote.email}</a><p className="mt-1 text-xs text-muted-foreground">{formatDate(quote.created_at)}</p></div>
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
