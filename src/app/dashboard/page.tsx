import { createAdminClient, createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, CheckCircle, Clock, CreditCard, MessageSquare, Mail, Phone, TriangleAlert, ShieldCheck } from 'lucide-react'
import { openBillingPortal, requestListingVerification, resumePremiumListingCheckout, resumePremiumMembershipCheckout, updateSellerInquiryStatus } from './actions'
import SafeListingImage from '@/components/SafeListingImage'
import { getStoredListingPublicationIssues } from '@/utils/listing-submission.mjs'
import SellerInquiryResponseForm from './SellerInquiryResponseForm'

type DashboardListingImage = {
  url: string
  is_primary?: boolean | null
}

type SellerInquiry = {
  id: string
  buyer_name: string
  buyer_email: string
  buyer_phone: string | null
  message: string
  currency: string
  initial_offer_amount_minor: number | null
  status: string
  seller_notification_status: string
  created_at: string
  listings: { id: string; title: string } | null
}

type InquiryOfferEvent = {
  id: string
  inquiry_id: string
  event_type: 'BUYER_OFFERED' | 'SELLER_ACCEPTED_FOR_NEGOTIATION' | 'SELLER_COUNTERED' | 'SELLER_DECLINED'
  actor_role: 'BUYER' | 'SELLER' | 'ADMIN'
  amount_minor: number | null
  currency: string
  note: string | null
  buyer_notification_status: 'pending' | 'accepted' | 'failed' | 'not_required'
  created_at: string
}

type ListingQualityState = {
  listing_id: string
  status: string
  previous_listing_status: string | null
}

type ListingVerificationState = {
  listing_id: string
  status: 'UNVERIFIED' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED'
  requested_at: string | null
  verified_at: string | null
  decision_reason: string | null
}

const formatClosedCode = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Get user profile for premium status
  const { data: profile } = await supabase
    .from('users')
    .select('is_premium, premium_source, stripe_customer_id')
    .eq('id', user.id)
    .single()

  // Get user listings
  const { data: listings } = await supabase
    .from('listings')
    .select('*, images(url, is_primary, created_at)')
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false })

  const { data: inquiries } = await supabase
    .from('marketplace_inquiries')
    .select('id,buyer_name,buyer_email,buyer_phone,message,currency,initial_offer_amount_minor,status,seller_notification_status,created_at,listings(id,title)')
    .order('created_at', { ascending: false })
  const inquiryIds = (inquiries || []).map((inquiry) => inquiry.id)
  const { data: inquiryOfferEvents } = inquiryIds.length > 0
    ? await supabase
      .from('marketplace_inquiry_offer_events')
      .select('id,inquiry_id,event_type,actor_role,amount_minor,currency,note,buyer_notification_status,created_at')
      .in('inquiry_id', inquiryIds)
      .order('created_at', { ascending: false })
    : { data: [] }
  const offerEventsByInquiry = ((inquiryOfferEvents as InquiryOfferEvent[] | null) || []).reduce<Map<string, InquiryOfferEvent[]>>((events, event) => {
    const inquiryEvents = events.get(event.inquiry_id) || []
    inquiryEvents.push(event)
    events.set(event.inquiry_id, inquiryEvents)
    return events
  }, new Map())

  const isPremium = profile?.is_premium || false
  const admin = await createAdminClient()
  const listingIds = (listings || []).map((listing) => listing.id)
  const { data: qualityStates } = listingIds.length > 0
    ? await admin
      .from('listing_quality_state')
      .select('listing_id,status,previous_listing_status')
      .in('listing_id', listingIds)
    : { data: [] }
  const qualityByListing = new Map(((qualityStates as ListingQualityState[] | null) || []).map((state) => [state.listing_id, state]))
  const { data: verificationStates } = listingIds.length > 0
    ? await admin
      .from('listing_verifications')
      .select('listing_id,status,requested_at,verified_at,decision_reason')
      .in('listing_id', listingIds)
    : { data: [] }
  const verificationByListing = new Map(((verificationStates as ListingVerificationState[] | null) || []).map((state) => [state.listing_id, state]))
  const { data: latestPremiumIntent } = !isPremium ? await admin
    .from('premium_checkout_intents')
    .select('status,source,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() : { data: null }
  const hasRecoverablePremiumIntent = latestPremiumIntent?.status === 'STARTED'

  return (
    <div className="min-h-screen bg-secondary/30 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {params.listing_payment === 'canceled' ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-semibold">Seller Launch Promotion payment was not completed.</p><p className="text-sm">Your listing is safely stored but not public. Resume the one-time payment below whenever you are ready.</p></div>
          </div>
        ) : null}
        {params.premium_payment === 'canceled' ? (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div><p className="font-semibold">Buyer Early Access payment was not completed.</p><p className="text-sm">Your account is active and the annual checkout can be resumed safely from Account Status.</p></div>
          </div>
        ) : null}
        {params.premium_payment === 'processing' || params.upgraded === 'true' ? (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">Stripe accepted the checkout. Buyer Early Access will appear here after the signed webhook is verified.</div>
        ) : null}
        
        {/* Header / Welcome */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Pilot Dashboard</h1>
            <p className="text-muted-foreground mt-1">Logged in as {user.email}</p>
          </div>
          <Link href="/sell?source=dashboard" className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all hover:translate-y-[-1px]">
            <Plus className="h-5 w-5" />
            List Equipment
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Account Status Card */}
          <div className="bg-background p-6 rounded-2xl border shadow-sm h-fit">
            <h2 className="text-lg font-semibold mb-4">Account Status</h2>
            <div className={`p-4 rounded-xl border ${isPremium ? 'bg-accent/10 border-accent/20 text-accent-foreground' : 'bg-muted border-border text-muted-foreground'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isPremium ? 'bg-accent text-white' : 'bg-secondary text-secondary-foreground'}`}>
                  {isPremium ? <CheckCircle className="h-5 w-5" /> : <Clock className="h-5 w-5" /> }
                </div>
                <div>
                  <p className="font-bold">{isPremium ? 'Buyer Early Access' : 'Standard Member'}</p>
                  <p className="text-xs opacity-80">{isPremium ? '48h early access active' : '48h delay on new listings'}</p>
                </div>
              </div>
              {!isPremium && (
                hasRecoverablePremiumIntent ? (
                  <form action={resumePremiumMembershipCheckout}>
                    <button className="mt-4 w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Continue Buyer Early Access checkout</button>
                  </form>
                ) : (
                  <Link href="/pricing" className="block mt-4 text-center bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:bg-primary/90 transition-colors">
                    Get Buyer Early Access
                  </Link>
                )
              )}
              {!isPremium && hasRecoverablePremiumIntent ? <p className="mt-2 text-center text-xs text-muted-foreground">Your earlier Buyer Early Access choice was retained; no new account is needed.</p> : null}
              {isPremium && profile?.premium_source === 'stripe' && profile?.stripe_customer_id && (
                <form action={openBillingPortal}>
                  <button className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-background text-foreground text-sm font-medium py-2 rounded-lg border hover:bg-muted transition-colors">
                    <CreditCard className="h-4 w-4" />
                    Manage billing
                  </button>
                </form>
              )}
              {isPremium && profile?.premium_source !== 'stripe' && (
                <p className="mt-4 text-xs text-muted-foreground">
                  Buyer Early Access is managed by AeroTrade admin.
                </p>
              )}
            </div>
          </div>

          {/* Listings List */}
          <div className="lg:col-span-2">
            <div className="bg-background p-6 rounded-2xl border shadow-sm">
              <h2 className="text-lg font-semibold mb-6">Your Listings</h2>
              
              {!listings || listings.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed rounded-xl">
                  <p className="text-muted-foreground">You haven't posted any equipment yet.</p>
                  <Link href="/sell?source=dashboard" className="text-primary font-medium text-sm inline-block mt-2 hover:underline">
                    Create your first listing
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {listings.map((item) => {
                    const quality = qualityByListing.get(item.id)
                    const verification = verificationByListing.get(item.id)
                    const isQualityRecovery = item.status === 'DRAFT'
                      && quality
                      && ['QUARANTINED', 'RESOLVED'].includes(quality.status)
                    const publicationIssues = getStoredListingPublicationIssues(item)
                    const supportingEvidenceAvailable = item.details && typeof item.details === 'object' && item.details.supporting_documents_available === true
                    const verificationEligible = ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'].includes(item.status)
                      && publicationIssues.length === 0
                      && supportingEvidenceAvailable
                    const primaryImage =
                      item.images?.find((image: DashboardListingImage) => image.is_primary)?.url ||
                      item.images?.[0]?.url ||
                      'https://images.unsplash.com/photo-1506521781263-d8422e8dbf27?q=80&w=600'
                    return (
                      <div key={item.id} className="flex items-center gap-4 p-4 border rounded-xl hover:bg-secondary/20 transition-colors">
                        <div className="w-16 h-16 rounded-lg overflow-hidden relative border bg-muted shrink-0">
                          <SafeListingImage src={primaryImage} alt={item.title} sizes="64px" className="object-cover" compact />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-sm text-foreground truncate">{item.title}</h3>
                          <p className="text-xs text-muted-foreground">{item.currency} {Number(item.price).toLocaleString()}</p>
                          <div className="mt-1">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${
                              item.status === 'ACTIVE_PREMIUM' || item.status === 'ACTIVE_PUBLIC' 
                                ? 'bg-green-50 text-green-700 border-green-200' 
                                : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            }`}>
                              {item.status.replace('_', ' ')}
                            </span>
                          </div>
                          {item.status === 'PENDING_PAYMENT' ? <p className="mt-1 text-xs font-medium text-amber-700">Not public — Seller Launch Promotion payment incomplete</p> : null}
                          {isQualityRecovery ? <p className="mt-1 text-xs font-medium text-amber-700">Paused — upload a working photo, then republish</p> : null}
                          {publicationIssues.length > 0 ? <p className="mt-1 text-xs font-medium text-amber-700">Aircraft data incomplete — {publicationIssues.join(', ')}</p> : null}
                          {verification?.status === 'VERIFIED' ? <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />AeroTrade evidence review complete</p> : null}
                          {verification?.status === 'IN_REVIEW' ? <p className="mt-1 text-xs font-semibold text-amber-700">Verification requested — queued for review</p> : null}
                          {verification?.status === 'REJECTED' ? <p className="mt-1 text-xs font-semibold text-red-700">Review incomplete — {verification.decision_reason ? formatClosedCode(verification.decision_reason) : 'evidence needs attention'}</p> : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {item.status === 'PENDING_PAYMENT' ? (
                            <form action={resumePremiumListingCheckout.bind(null, item.id)}>
                              <button className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">Resume €5 payment</button>
                            </form>
                          ) : null}
                          <Link href={`/catalog/${item.id}`} className="text-sm font-medium text-primary hover:underline">View</Link>
                          {isQualityRecovery ? <Link href={`/catalog/${item.id}/edit`} className="text-xs font-semibold text-amber-700 hover:underline">Repair photos</Link> : null}
                          {verificationEligible && !['IN_REVIEW', 'VERIFIED'].includes(verification?.status || '') ? (
                            <form action={requestListingVerification.bind(null, item.id)}>
                              <button className="rounded-lg border border-primary/30 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/5">{verification?.status === 'REJECTED' ? 'Request another review' : 'Request document check'}</button>
                            </form>
                          ) : null}
                          {!supportingEvidenceAvailable && ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'].includes(item.status) ? <Link href={`/catalog/${item.id}/edit`} className="max-w-40 text-right text-xs font-semibold text-amber-700 hover:underline">Mark supporting evidence available to request review</Link> : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border bg-background p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2"><MessageSquare className="h-5 w-5 text-primary" /></div>
            <div>
              <h2 className="text-lg font-semibold">Buyer enquiries</h2>
              <p className="text-sm text-muted-foreground">Track each opportunity through contact, negotiation and outcome.</p>
            </div>
          </div>
          {!inquiries?.length ? (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No tracked enquiries yet.</p>
          ) : (
            <div className="space-y-4">
              {(inquiries as unknown as SellerInquiry[]).map((inquiry) => {
                const negotiationEvents = offerEventsByInquiry.get(inquiry.id) || []
                const isClosed = ['WON', 'LOST', 'SPAM'].includes(inquiry.status)
                const formatOffer = (event: InquiryOfferEvent) => event.amount_minor === null
                  ? null
                  : (Number(event.amount_minor) / 100).toLocaleString('en-IE', { style: 'currency', currency: event.currency })
                return <article key={inquiry.id} className="rounded-xl border p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold text-primary">{inquiry.status}</span>
                        {inquiry.seller_notification_status === 'failed' ? <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">Email notification failed — visible here</span> : null}
                      </div>
                      <p className="font-semibold">{inquiry.buyer_name} · {inquiry.listings?.title || 'Listing'}</p>
                      <div className="flex flex-wrap gap-4 text-sm">
                        <a href={`mailto:${inquiry.buyer_email}`} className="inline-flex items-center gap-1 text-primary hover:underline"><Mail className="h-4 w-4" />{inquiry.buyer_email}</a>
                        {inquiry.buyer_phone ? <a href={`tel:${inquiry.buyer_phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-4 w-4" />{inquiry.buyer_phone}</a> : null}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">{inquiry.message}</p>
                      {negotiationEvents.length > 0 ? (
                        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Non-binding negotiation history</p>
                          {negotiationEvents.map((event) => (
                            <div key={event.id} className="text-sm">
                              <p><strong>{event.event_type.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</strong>{formatOffer(event) ? ` · ${formatOffer(event)}` : ''}</p>
                              {event.note ? <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{event.note}</p> : null}
                              <p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(event.created_at))}{event.actor_role !== 'BUYER' ? ` · buyer email ${event.buyer_notification_status}` : ''}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <p className="text-xs text-muted-foreground">Received {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(inquiry.created_at))}</p>
                    </div>
                    <div className="w-full shrink-0 space-y-3 lg:w-80">
                      {!isClosed ? (
                        <SellerInquiryResponseForm inquiryId={inquiry.id} currency={inquiry.currency} />
                      ) : null}
                      {!isClosed ? <form action={updateSellerInquiryStatus.bind(null, inquiry.id)} className="flex items-center gap-2">
                        <select name="status" defaultValue={inquiry.status === 'NEW' || inquiry.status === 'SELLER_NOTIFIED' ? 'CONTACTED' : inquiry.status} className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm">
                          <option value="CONTACTED">Contacted</option>
                          <option value="QUALIFIED">Qualified</option>
                          <option value="NEGOTIATING">Negotiating</option>
                          <option value="LOST">Lost</option>
                          <option value="SPAM">Spam</option>
                        </select>
                        <button className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">Save</button>
                      </form> : <p className="text-xs text-muted-foreground">This enquiry is closed. A won result is recorded centrally with its economic evidence.</p>}
                    </div>
                  </div>
                </article>
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
