import { createClient, createAdminClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Lock, MapPin, Calendar, Activity, CheckCircle2, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import ContactSeller from './ContactSeller'
import { Metadata } from 'next'
import { getListingVisibility, getPublicTeaserTitle, type ListingWithImages } from '@/utils/listings'
import { siteUrl } from '@/utils/site'
import { payListingFee, publishListingFree, republishQuarantinedListing } from './actions'
import ListingViewTracker from './ListingViewTracker'
import BuyerInquiryForm from './BuyerInquiryForm'
import SafeListingImage from '@/components/SafeListingImage'
import { getStoredListingPublicationIssues } from '@/utils/listing-submission.mjs'
import {
  buildListingBreadcrumbJsonLd,
  buildListingProductJsonLd,
  getPublicListingSeoData,
  isListingPubliclyIndexable,
  serializeJsonLd,
} from '@/utils/marketplace-seo.mjs'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabaseAdmin = await createAdminClient()
  const { data: listing } = await supabaseAdmin
    .from('listings')
    .select('id, title, description, category, price, currency, condition, location_country, details, status, public_at, images(url, is_primary)')
    .eq('id', id)
    .single()

  const seo = listing ? getPublicListingSeoData(listing, siteUrl) : null
  if (!seo) {
    return {
      title: 'Private or unavailable listing | AeroTrade',
      description: 'This listing is not currently available in the public AeroTrade marketplace.',
      robots: { index: false, follow: true },
    }
  }

  return {
    title: `${seo.title} | AeroTrade Marketplace`,
    description: seo.description,
    alternates: { canonical: `/catalog/${id}` },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    openGraph: {
      type: 'website',
      siteName: 'AeroTrade',
      title: seo.title,
      description: seo.description,
      url: seo.url,
      ...(seo.images[0] ? { images: [{ url: seo.images[0], alt: seo.title }] } : {}),
    },
    twitter: {
      card: seo.images[0] ? 'summary_large_image' : 'summary',
      title: seo.title,
      description: seo.description,
      ...(seo.images[0] ? { images: [seo.images[0]] } : {}),
    },
  }
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const supabaseAdmin = await createAdminClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  let isPremium = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
    isPremium = profile?.is_premium || false
  }

  // Fetch Listing
  const { data: listing, error } = await supabaseAdmin
    .from('listings')
    .select(`
      id,
      seller_id,
      category,
      title,
      description,
      price,
      currency,
      condition,
      location_country,
      details,
      status,
      public_at,
      created_at,
      updated_at,
      images(url, is_primary),
      listing_verifications(status, public_summary, verified_at)
    `)
    .eq('id', id)
    .single()

  if (error || !listing) {
    notFound()
  }

  const typedListing = listing as ListingWithImages
  const { data: qualityState } = user?.id === listing.seller_id
    ? await supabaseAdmin
      .from('listing_quality_state')
      .select('status,previous_listing_status')
      .eq('listing_id', listing.id)
      .maybeSingle()
    : { data: null }
  const verification = (listing as typeof listing & { listing_verifications?: Array<{ status: string; public_summary: string; verified_at: string | null }> }).listing_verifications?.[0]
  const isDocumentChecked = verification?.status === 'VERIFIED'

  // Determine visibility rights
  const { isPremiumExclusive, isOwner, canViewFully } = getListingVisibility(
    typedListing,
    user?.id,
    isPremium
  )
  const isActiveListing = typedListing.status === 'ACTIVE_PUBLIC' || typedListing.status === 'ACTIVE_PREMIUM'
  const isQualityRecovery = typedListing.status === 'DRAFT'
    && qualityState?.status !== undefined
    && ['QUARANTINED', 'RESOLVED'].includes(qualityState.status)
    && ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'].includes(qualityState.previous_listing_status || '')
  const publicationIssues = getStoredListingPublicationIssues(typedListing)
  const isPubliclyIndexable = isListingPubliclyIndexable(typedListing)
  const productJsonLd = buildListingProductJsonLd(typedListing, siteUrl)
  const breadcrumbJsonLd = buildListingBreadcrumbJsonLd(typedListing, siteUrl)
  const structuredData = [productJsonLd, breadcrumbJsonLd].filter(Boolean)

  if (!isActiveListing && !isOwner) {
    notFound()
  }

  const images = canViewFully
    ? [...(typedListing.images || [])]
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((img) => img.url)
    : []
  const displayTitle = canViewFully ? typedListing.title : getPublicTeaserTitle(typedListing.category)
  const displayPrice = canViewFully
    ? typedListing.price === 0 ? 'Inquire for Pricing' : `${Number(typedListing.price).toLocaleString()} ${typedListing.currency}`
    : 'Premium Exclusive'
  const publicAtLabel = typedListing.public_at
    ? formatDistanceToNow(new Date(typedListing.public_at))
    : 'soon'
  const newBalloonParams = new URLSearchParams({
    source: 'listing',
    category: typedListing.category,
    q: typedListing.title,
    country: typedListing.location_country,
  })
  const newBalloonHref = `/new-balloon?${newBalloonParams.toString()}`

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <ListingViewTracker listingId={typedListing.id} />
      {/* Public-only structured data. Premium previews and owner-only drafts never leak into it. */}
      {isPubliclyIndexable && canViewFully && structuredData.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializeJsonLd(structuredData)
          }}
        />
      )}

      {/* Premium Teaser Bar */}
      {isPremiumExclusive && !canViewFully && (
        <div className="bg-accent text-accent-foreground p-4 rounded-xl mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 shrink-0" />
            <p className="font-medium text-sm sm:text-base">
              This listing is in the 48-hour Premium Exclusive window. It will be public in {publicAtLabel}.
            </p>
          </div>
          <Link href="/pricing" className="bg-background text-foreground hover:bg-muted px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors">
            Unlock Now
          </Link>
        </div>
      )}

      {canViewFully && isDocumentChecked ? (
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">AeroTrade document-checked listing</p>
            <p className="mt-1 text-sm">{verification.public_summary}</p>
          </div>
        </div>
      ) : null}

      {isPremiumExclusive && canViewFully && !isOwner && (
        <div className="bg-primary/10 text-primary border border-primary/20 p-4 rounded-xl mb-8 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="font-medium text-sm">
            You are viewing this listing securely within the 48-hour Premium window.
          </p>
        </div>
      )}

      {typedListing.status === 'PENDING_PAYMENT' && isOwner && (
        <div className="bg-accent/10 text-accent-foreground border border-accent/20 p-4 rounded-xl mb-8 flex items-center gap-3">
          <Lock className="w-5 h-5 shrink-0" />
          <p className="font-medium text-sm">
            Premium payment is pending. Complete payment to start promotion, or publish this listing for free.
          </p>
        </div>
      )}

      {isQualityRecovery && isOwner ? (
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">This listing is paused because none of its stored photos could be retrieved.</p>
            <p className="mt-1 text-sm">Edit the listing, upload at least one working photo, then return here to republish it. Its description and commercial history are preserved.</p>
          </div>
        </div>
      ) : null}

      {isOwner && publicationIssues.length > 0 ? (
        <div className="mb-8 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Aircraft identity information needs attention.</p>
            <p className="mt-1 text-sm">Required fields missing: {publicationIssues.join(', ')}. AeroTrade will not guess these values or republish this aircraft until you add them.</p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Left: Images */}
        <div className="space-y-4 order-2 lg:order-1">
          <div className="relative aspect-[4/3] sm:aspect-auto sm:h-[min(72vh,620px)] sm:min-h-[260px] bg-muted rounded-2xl overflow-hidden border">
            {images.length > 0 ? (
              <SafeListingImage
                src={images[0]}
                alt={displayTitle}
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-contain transition-all duration-700"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30">
                <Lock className="w-16 h-16 mb-4" />
                <p>No Image Available</p>
              </div>
            )}

            {!canViewFully && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/20 backdrop-blur-[2px] text-center p-6">
                <Lock className="w-12 h-12 text-accent mb-4" />
                <h3 className="text-2xl font-extrabold shadow-sm">Premium Exclusive</h3>
                <p className="text-muted-foreground font-medium mt-2 max-w-sm">
                  Photos and full details are currently locked. Upgrade to unlock this listing immediately.
                </p>
                <Link href="/pricing" className="mt-6 bg-accent text-accent-foreground px-8 py-3 rounded-full font-bold hover:opacity-90 transition-opacity">
                  View Full Listing
                </Link>
              </div>
            )}
          </div>

          {/* Thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-4 overflow-x-auto pb-2">
              {images.map((img: string, idx: number) => (
                <div key={idx} className="relative w-24 h-24 shrink-0 rounded-xl overflow-hidden border bg-muted">
                  <SafeListingImage src={img} sizes="96px" className="object-cover" compact alt={`Thumbnail ${idx + 1} for ${displayTitle}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Details */}
        <div className="flex flex-col order-1 lg:order-2">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted px-3 py-1 rounded-full">{typedListing.category}</span>
              {canViewFully && (
                <span className="text-xs font-bold text-secondary-foreground bg-secondary px-3 py-1 rounded-full">{typedListing.condition}</span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-4">
              {displayTitle}
            </h1>

            <p className="text-4xl font-black text-foreground">
              {displayPrice}
            </p>
            {canViewFully && (
              <p className="text-muted-foreground flex items-center mt-2">
                <MapPin className="w-4 h-4 mr-1" /> {typedListing.location_country}
              </p>
            )}
          </div>

          <div className="bg-card border rounded-2xl p-6 mb-8 flex-1">
            <h3 className="text-lg font-bold mb-4 border-b pb-2">Equipment Details</h3>

            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
              {canViewFully && typedListing.details?.manufacturer && (
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1">Manufacturer</span><span className="font-medium text-base">{typedListing.details.manufacturer}</span></div>
              )}
              {canViewFully && typedListing.details?.model && (
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1">Model/Volume</span><span className="font-medium text-base">{typedListing.details.model}</span></div>
              )}
              {canViewFully && typedListing.details?.year && (
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1"><Calendar className="w-3 h-3 inline mr-1"/>Year</span><span className="font-medium text-base">{typedListing.details.year}</span></div>
              )}
              {canViewFully && typedListing.details?.hours && (
                <div><span className="text-primary block text-xs font-bold uppercase tracking-wider mb-1"><Activity className="w-3 h-3 inline mr-1"/>Total Hours</span><span className="font-bold text-base">{typedListing.details.hours}</span></div>
              )}
              {canViewFully && typedListing.details?.dimensions && (
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1">Dimensions</span><span className="font-medium text-base">{typedListing.details.dimensions}</span></div>
              )}
              {canViewFully && typedListing.details?.type && (
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1">Burner Type</span><span className="font-medium text-base">{typedListing.details.type}</span></div>
              )}
              {canViewFully && typedListing.details?.registration && (
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1">Registration</span><span className="font-medium text-base">{typedListing.details.registration}</span></div>
              )}
              {canViewFully && typedListing.details?.serial && (
                <div className="col-span-2 md:col-span-1"><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1">Serial Number</span><span className="font-mono text-sm">{typedListing.details.serial}</span></div>
              )}
            </div>

            {canViewFully && (typedListing.details?.supporting_documents_available || typedListing.details?.last_inspection_date) ? (
              <div className="mt-6 rounded-xl border bg-muted/30 p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Seller-declared supporting information</p>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  {typedListing.details?.supporting_documents_available ? <span className="rounded-full bg-background px-3 py-1 font-medium">Supporting documents available</span> : null}
                  {typedListing.details?.last_inspection_date ? <span className="rounded-full bg-background px-3 py-1 font-medium">Last inspection stated: {String(typedListing.details.last_inspection_date)}</span> : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Declared by the seller; not independently verified unless the AeroTrade document-checked badge appears above.</p>
              </div>
            ) : null}

            <div className="mt-8">
              <span className="text-muted-foreground block text-xs uppercase tracking-wider mb-2">Description</span>
              <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">
                {canViewFully ? typedListing.description : 'Full equipment details are available to Premium members during the exclusive window.'}
              </p>
            </div>
          </div>

          {/* Contact Action */}
          <div className="mt-auto">
            {!canViewFully ? (
              <div className="space-y-3">
                <Link href="/pricing" className="w-full flex justify-center items-center gap-2 bg-accent text-accent-foreground py-4 rounded-xl font-bold text-lg hover:opacity-90 transition-opacity">
                  <Lock className="w-5 h-5" />
                  Upgrade to Contact Seller
                </Link>
                <Link href={newBalloonHref} className="w-full flex justify-center items-center gap-2 border border-primary/30 bg-primary/5 py-3 rounded-xl font-bold text-primary hover:bg-primary/10 transition-colors">
                  Buy a new balloon instead
                </Link>
              </div>
            ) : isOwner ? (
               <div className="space-y-3">
                 <div className="w-full text-center p-4 bg-muted text-muted-foreground rounded-xl font-medium border">
                   This is your listing.
                 </div>
                 {(typedListing.status === 'PENDING_PAYMENT' || (typedListing.status === 'DRAFT' && !isQualityRecovery)) && (
                   <div className="grid gap-3 sm:grid-cols-2">
                     <form action={async () => {
                       'use server'
                       await payListingFee(typedListing.id)
                     }}>
                       <button className="w-full flex justify-center items-center gap-2 bg-accent text-accent-foreground py-4 rounded-xl font-bold text-base hover:opacity-90 transition-opacity">
                         Complete Premium Payment
                       </button>
                     </form>
                     <form action={async () => {
                       'use server'
                       await publishListingFree(typedListing.id)
                     }}>
                       <button className="w-full flex justify-center items-center gap-2 border border-primary/30 bg-primary/5 py-4 rounded-xl font-bold text-base text-primary hover:bg-primary/10 transition-colors">
                         Publish Free Instead
                       </button>
                     </form>
                   </div>
                 )}
                 {isQualityRecovery ? (
                   <form action={async () => {
                     'use server'
                     await republishQuarantinedListing(typedListing.id)
                   }}>
                     <button className="w-full rounded-xl bg-accent py-4 text-base font-bold text-accent-foreground hover:opacity-90">
                       Republish corrected listing
                     </button>
                   </form>
                 ) : null}
                 <Link href={`/catalog/${typedListing.id}/edit`} className="w-full flex justify-center items-center gap-2 bg-primary text-primary-foreground py-4 rounded-xl font-bold text-lg hover:bg-primary/90 transition-all shadow-md">
                   Edit Listing Details & Photos
                 </Link>
               </div>
            ) : (
              <div className="space-y-4">
                <BuyerInquiryForm listingId={typedListing.id} listingCurrency={typedListing.currency} />
                <div className="pt-3 border-t">
                  <p className="mb-3 text-center text-xs text-muted-foreground">Prefer to contact the seller directly?</p>
                  <ContactSeller listingId={typedListing.id} />
                </div>
                <div className="grid gap-2 border-t pt-4 sm:grid-cols-2">
                  <Link href={`/wanted?category=${encodeURIComponent(typedListing.category)}`} className="rounded-lg border px-3 py-2 text-center text-sm font-semibold text-primary">Find another used option</Link>
                  <Link href={newBalloonHref} className="rounded-lg bg-primary/10 px-3 py-2 text-center text-sm font-semibold text-primary">Buy a new Pasha or Schroeder</Link>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
