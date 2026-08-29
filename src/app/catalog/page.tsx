import Link from 'next/link'
import { createClient, createAdminClient } from '@/utils/supabase/server'
import { Search, Lock, Filter } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Metadata } from 'next'
import { getListingVisibility, getPrimaryImageUrl, getPublicTeaserTitle, type ListingWithImages } from '@/utils/listings'
import SafeListingImage from '@/components/SafeListingImage'
import CatalogSearchTracker from './CatalogSearchTracker'
import { getCatalogCategory, getCatalogCategoryPath } from '@/utils/catalog-categories.mjs'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Catalog | AeroTrade Marketplace',
  description: 'Browse the latest hot air balloon equipment worldwide. Find balloons, envelopes, baskets, and burners.',
  alternates: { canonical: '/catalog' },
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const legacyCategory = getCatalogCategory(typeof params.category === 'string' ? params.category : null)

  if (legacyCategory) {
    const normalized = new URLSearchParams()
    for (const key of ['q', 'country', 'sort']) {
      const value = params[key]
      if (typeof value === 'string' && value.trim()) normalized.set(key, value.trim())
    }
    const query = normalized.toString()
    redirect(`${getCatalogCategoryPath(legacyCategory.slug)}${query ? `?${query}` : ''}`)
  }

  return <CatalogExperience searchParams={Promise.resolve(params)} />
}

export async function CatalogExperience({
  searchParams,
  fixedCategory,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
  fixedCategory?: string | null
}) {
  const supabase = await createClient()
  const supabaseAdmin = await createAdminClient()
  const params = await searchParams

  const category = getCatalogCategory(fixedCategory || (typeof params.category === 'string' ? params.category : null))
  const categoryFilter = category?.slug || null
  const searchQuery = typeof params.q === 'string' ? params.q.trim() : ''
  const countryFilter = typeof params.country === 'string' ? params.country.trim() : ''
  const sort = typeof params.sort === 'string' && ['newest', 'price_asc', 'price_desc'].includes(params.sort) ? params.sort : 'newest'
  const newBalloonParams = new URLSearchParams({ source: searchQuery || categoryFilter || countryFilter ? 'catalog-empty' : 'catalog' })
  if (categoryFilter) newBalloonParams.set('category', categoryFilter)
  if (searchQuery) newBalloonParams.set('q', searchQuery)
  if (countryFilter) newBalloonParams.set('country', countryFilter)
  const newBalloonHref = `/new-balloon?${newBalloonParams.toString()}`

  // Fetch current user & premium status
  const { data: { user } } = await supabase.auth.getUser()
  let isPremium = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
    isPremium = profile?.is_premium || false
  }

  // Fetch active listings. Locked premium results are rendered with teaser-only fields.
  let countryQuery = supabaseAdmin
    .from('listings')
    .select('location_country')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
  if (categoryFilter) countryQuery = countryQuery.eq('category', categoryFilter)
  const { data: countryRows } = await countryQuery
  const countries = Array.from(new Set((countryRows || []).map((row) => row.location_country).filter(Boolean))).sort((a, b) => a.localeCompare(b))

  let query = supabaseAdmin
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
      status,
      public_at,
      created_at,
      images (url, is_primary)
    `)
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])

  if (categoryFilter) {
    query = query.eq('category', categoryFilter)
  }

  if (searchQuery) {
    const escapedQuery = searchQuery.replace(/[%_]/g, (value) => `\\${value}`)
    query = query.or(`title.ilike.%${escapedQuery}%,description.ilike.%${escapedQuery}%,location_country.ilike.%${escapedQuery}%`)
  }

  if (countryFilter) query = query.eq('location_country', countryFilter)
  query = sort === 'price_asc'
    ? query.order('price', { ascending: true }).order('created_at', { ascending: false })
    : sort === 'price_desc'
      ? query.order('price', { ascending: false }).order('created_at', { ascending: false })
      : query.order('created_at', { ascending: false })

  const { data: rawListings, error } = await query

  if (error) {
    console.error(error)
    return <div className="p-12 text-center text-destructive">Failed to load listings.</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <CatalogSearchTracker search={{ query: searchQuery, category: categoryFilter, country: countryFilter, sort, resultCount: rawListings?.length || 0 }} />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{category?.heading || 'Marketplace Catalog'}</h1>
          <p className="text-muted-foreground mt-1">{category?.description || 'Browse the latest hot air balloon equipment worldwide.'}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold"><Link href={categoryFilter ? `/wanted?category=${encodeURIComponent(categoryFilter)}` : '/wanted'} className="text-primary hover:underline">Cannot find it used? Record what you need →</Link><Link href={newBalloonHref} className="text-primary hover:underline">Prefer factory-new? Buy through AeroTrade →</Link></div>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-2 bg-muted/50 p-1.5 rounded-lg border">
          <Link href="/catalog" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!categoryFilter ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>All</Link>
          <Link href={getCatalogCategoryPath('complete')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'complete' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Balloons</Link>
          <Link href={getCatalogCategoryPath('envelopes')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'envelopes' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Envelopes</Link>
          <Link href={getCatalogCategoryPath('baskets')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'baskets' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Baskets</Link>
          <Link href={getCatalogCategoryPath('burners')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'burners' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Burners</Link>
          <Link href={getCatalogCategoryPath('bottom-end')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'bottom-end' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Bottom Ends</Link>
          <Link href={getCatalogCategoryPath('cylinders')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'cylinders' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Cylinders</Link>
          <Link href={getCatalogCategoryPath('other-equipment')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'other-equipment' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Other Equipment</Link>
        </div>
      </div>

      <form method="get" action={categoryFilter ? getCatalogCategoryPath(categoryFilter) : '/catalog'} className="mb-8 grid gap-3 rounded-2xl border bg-card p-4 md:grid-cols-[1fr_220px_180px_auto]">
        <label className="relative">
          <span className="sr-only">Search equipment</span>
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <input name="q" defaultValue={searchQuery} placeholder="Manufacturer, model, country…" className="w-full rounded-lg border bg-background py-2.5 pl-9 pr-3" />
        </label>
        <select name="country" defaultValue={countryFilter} className="rounded-lg border bg-background px-3 py-2.5">
          <option value="">All countries</option>
          {countries.map((country) => <option key={country} value={country}>{country.trim()}</option>)}
        </select>
        <select name="sort" defaultValue={sort} className="rounded-lg border bg-background px-3 py-2.5">
          <option value="newest">Newest first</option>
          <option value="price_asc">Lowest price</option>
          <option value="price_desc">Highest price</option>
        </select>
        <button className="rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background">Apply</button>
      </form>

      <div className="mb-8 grid gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <div><p className="font-bold">Did not find the balloon or equipment you want?</p><p className="mt-1 text-sm text-muted-foreground">Tell AeroTrade what is missing so we can help find it, or request an approximate budget for a factory-new Pasha or Schroeder balloon. New aircraft are available independently of today&apos;s used inventory.</p></div>
        <Link href={categoryFilter ? `/wanted?category=${encodeURIComponent(categoryFilter)}` : '/wanted'} className="rounded-lg border border-primary/30 bg-background px-4 py-2 text-center text-sm font-semibold text-primary">Tell us what you need</Link>
        <Link href={newBalloonHref} className="rounded-lg bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">Get a new-balloon estimate</Link>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{rawListings?.length || 0} matching listing(s)</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {(rawListings as ListingWithImages[] | null)?.map((listing) => {
          const { isPremiumExclusive, canViewFully } = getListingVisibility(listing, user?.id, isPremium)
          const primaryImage = canViewFully ? getPrimaryImageUrl(listing) : null
          const displayTitle = canViewFully ? listing.title : getPublicTeaserTitle(listing.category)
          const displayPrice = canViewFully
            ? listing.price === 0 ? 'Inquire for Pricing' : `${Number(listing.price).toLocaleString()} ${listing.currency}`
            : 'Premium Exclusive'
          const publicAtLabel = listing.public_at
            ? formatDistanceToNow(new Date(listing.public_at))
            : 'soon'

          if (!canViewFully) {
            // RENDER LOCKED / BLURRED CARD FOR NON-PREMIUM USERS
            return (
              <div key={listing.id} className="rounded-2xl border bg-card overflow-hidden group flex flex-col h-full relative">
                <div className="h-48 bg-slate-200 relative overflow-hidden flex items-center justify-center shrink-0">
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-white px-4 text-center">
                    <Lock className="w-8 h-8 mb-2 text-accent" />
                    <span className="font-bold tracking-tight text-sm">PREMIUM EXCLUSIVE</span>
                    <p className="text-xs mt-1 text-slate-300">Public in {publicAtLabel}</p>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{listing.category}</span>
                    <span className="text-[10px] font-bold bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full ring-1 ring-accent/30">Locked</span>
                  </div>
                  {/* Masking Title & Precise Price */}
                  <h3 className="font-bold text-lg mb-1 line-clamp-2 text-muted">{displayTitle}</h3>
                  <p className="text-xl font-extrabold text-foreground mb-4 text-muted">{displayPrice}</p>
                  <div className="mt-auto pt-4 flex items-center justify-between border-t border-dashed">
                    <span className="text-xs text-muted-foreground">{listing.location_country}</span>
                    <Link href={`/catalog/${listing.id}`} className="text-accent font-semibold hover:underline text-sm flex items-center gap-1">
                      Unlock <Lock className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            )
          }

          // RENDER FULL CARD FOR PREMIUM USERS OR AFTER 48H
          return (
            <Link href={`/catalog/${listing.id}`} key={listing.id} className="rounded-2xl border bg-card overflow-hidden group hover:shadow-md transition-shadow cursor-pointer flex flex-col h-full">
              <div className="h-48 bg-muted relative overflow-hidden flex items-center justify-center shrink-0">
                {primaryImage ? (
                  <SafeListingImage src={primaryImage} alt={displayTitle} sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <Search className="w-8 h-8 text-muted-foreground/30" />
                )}
                {isPremiumExclusive && (
                  <div className="absolute top-2 right-2 bg-accent text-accent-foreground text-[10px] font-bold px-2 py-1 rounded-md shadow-sm">
                    Premium Active
                  </div>
                )}
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{listing.category}</span>
                  <span className="text-xs font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">{listing.condition}</span>
                </div>
                <h3 className="font-bold text-lg mb-1 line-clamp-2 group-hover:text-primary transition-colors">{displayTitle}</h3>
                <p className="text-xl font-extrabold text-foreground mb-4">{displayPrice}</p>
                
                <div className="mt-auto w-full pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
                  <span className="truncate pr-2">{listing.location_country}</span>
                  <span className="shrink-0">{formatDistanceToNow(new Date(listing.created_at))} ago</span>
                </div>
              </div>
            </Link>
          )
        })}

        {rawListings?.length === 0 && (
          <div className="col-span-full py-20 text-center flex flex-col items-center">
            <Filter className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground">No suitable used equipment found</h3>
            <p className="mt-1 max-w-2xl text-muted-foreground">You do not have to wait for another listing. Tell AeroTrade what you need, or ask us for an approximate budget for a factory-new Pasha or Schroeder balloon.</p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
              <Link href={categoryFilter ? `/wanted?category=${encodeURIComponent(categoryFilter)}` : '/wanted'} className="rounded-lg bg-foreground px-5 py-2 text-sm font-bold text-background">Ask us to find a used option</Link>
              <Link href={newBalloonHref} className="bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                Get an approximate new-balloon budget
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
