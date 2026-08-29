import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Factory, Search, ShieldCheck } from 'lucide-react'
import CommercialAttributionSeed from '@/components/CommercialAttributionSeed'
import SafeListingImage from '@/components/SafeListingImage'
import { getPrimaryImageUrl, type ListingWithImages } from '@/utils/listings'
import { createAdminClient } from '@/utils/supabase/server'
import { europeanBuyerLandingAlternates } from '@/utils/european-buyer-landings.mjs'
import { buildBuyerAcquisitionCollectionJsonLd, isListingPubliclyIndexable, serializeJsonLd } from '@/utils/marketplace-seo.mjs'
import { siteUrl } from '@/utils/site'

type EuropeanBuyerLandingContent = {
  key: string
  locale: string
  lang: string
  path: string
  title: string
  description: string
  eyebrow: string
  heading: string
  intro: string
  inventoryLabel: string
  inventoryHeading: string
  inventoryEmpty: string
  catalogCta: string
  wantedHeading: string
  wantedBody: string
  wantedCta: string
  newHeading: string
  newBody: string
  newCta: string
  trustHeading: string
  trustBody: string
  priceOnRequest: string
  viewListing: string
}

export function buildEuropeanBuyerLandingMetadata(landing: EuropeanBuyerLandingContent): Metadata {
  return {
    title: landing.title,
    description: landing.description,
    alternates: {
      canonical: landing.path,
      languages: europeanBuyerLandingAlternates,
    },
    openGraph: {
      type: 'website',
      siteName: 'AeroTrade',
      locale: landing.locale.replace('-', '_'),
      title: landing.title,
      description: landing.description,
      url: landing.path,
    },
    twitter: {
      card: 'summary',
      title: landing.title,
      description: landing.description,
    },
  }
}

export default async function EuropeanBuyerLanding({ landing }: { landing: EuropeanBuyerLandingContent }) {
  const supabase = await createAdminClient()
  const { data, error } = await supabase
    .from('listings')
    .select('id,seller_id,category,title,description,price,currency,condition,location_country,details,status,public_at,created_at,images(url,is_primary)')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
    .order('created_at', { ascending: false })

  const publicListings = ((error ? [] : data) || [])
    .filter((listing) => isListingPubliclyIndexable(listing)) as ListingWithImages[]
  const featuredListings = publicListings.slice(0, 6)
  const wantedHref = '/wanted?category=complete'
  const newBalloonHref = '/new-balloon?source=catalog&category=complete'
  const collectionJsonLd = buildBuyerAcquisitionCollectionJsonLd({
    siteUrl,
    path: landing.path,
    name: landing.heading,
    description: landing.description,
    language: landing.locale,
    listings: featuredListings,
  })

  return (
    <div lang={landing.lang} className="bg-secondary/30">
      <CommercialAttributionSeed />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionJsonLd) }} />

      <section className="border-b bg-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8 lg:py-16">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">{landing.eyebrow}</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight sm:text-5xl">{landing.heading}</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">{landing.intro}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/catalog" className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground">
                {landing.catalogCta} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href={wantedHref} className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-5 py-3 font-semibold text-foreground">
                {landing.wantedCta} <Search className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="grid content-center gap-4">
            <div className="rounded-2xl border bg-card p-6 shadow-sm">
              <p className="text-5xl font-extrabold tracking-tight text-primary">{publicListings.length}</p>
              <p className="mt-2 text-sm font-semibold text-muted-foreground">{landing.inventoryLabel}</p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h2 className="mt-3 text-lg font-bold">{landing.trustHeading}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{landing.trustBody}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{landing.inventoryHeading}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{publicListings.length} {landing.inventoryLabel}</p>
          </div>
          <Link href="/catalog" className="font-semibold text-primary hover:underline">{landing.catalogCta} →</Link>
        </div>

        {featuredListings.length ? (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredListings.map((listing) => {
              const image = getPrimaryImageUrl(listing)
              const price = Number(listing.price) > 0
                ? `${Number(listing.price).toLocaleString(landing.locale)} ${listing.currency}`
                : landing.priceOnRequest

              return (
                <Link key={listing.id} href={`/catalog/${listing.id}`} className="group overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md">
                  <div className="relative h-48 bg-muted">
                    {image ? (
                      <SafeListingImage src={image} alt={listing.title} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center"><Search className="h-8 w-8 text-muted-foreground/30" /></div>
                    )}
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{listing.category.replaceAll('-', ' ')} · {listing.location_country}</p>
                    <h3 className="mt-2 line-clamp-2 text-lg font-bold group-hover:text-primary">{listing.title}</h3>
                    <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
                      <span className="font-extrabold">{price}</span>
                      <span className="text-sm font-semibold text-primary">{landing.viewListing} →</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border bg-card p-8 text-muted-foreground">{landing.inventoryEmpty}</div>
        )}
      </section>

      <section className="border-y bg-background">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="rounded-2xl border bg-card p-6 sm:p-8">
            <Search className="h-6 w-6 text-primary" />
            <h2 className="mt-4 text-2xl font-bold">{landing.wantedHeading}</h2>
            <p className="mt-3 leading-7 text-muted-foreground">{landing.wantedBody}</p>
            <Link href={wantedHref} className="mt-6 inline-flex items-center gap-2 font-semibold text-primary hover:underline">{landing.wantedCta} <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8">
            <Factory className="h-6 w-6 text-primary" />
            <h2 className="mt-4 text-2xl font-bold">{landing.newHeading}</h2>
            <p className="mt-3 leading-7 text-muted-foreground">{landing.newBody}</p>
            <Link href={newBalloonHref} className="mt-6 inline-flex items-center gap-2 font-semibold text-primary hover:underline">{landing.newCta} <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </div>
  )
}
