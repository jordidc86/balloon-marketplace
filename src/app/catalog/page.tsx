import Link from 'next/link'
import Image from 'next/image'
import { createClient, createAdminClient } from '@/utils/supabase/server'
import { Search, Lock, Filter } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Metadata } from 'next'
import { getListingVisibility, getPrimaryImageUrl, getPublicTeaserTitle, type ListingWithImages } from '@/utils/listings'

export const metadata: Metadata = {
  title: 'Catalog | AeroTrade Marketplace',
  description: 'Browse the latest hot air balloon equipment worldwide. Find balloons, envelopes, baskets, and burners.',
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const supabaseAdmin = await createAdminClient()
  const params = await searchParams
  
  const categoryFilter = typeof params.category === 'string' ? params.category : null
  const searchQuery = typeof params.q === 'string' ? params.q.trim() : ''

  // Fetch current user & premium status
  const { data: { user } } = await supabase.auth.getUser()
  let isPremium = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
    isPremium = profile?.is_premium || false
  }

  // Fetch active listings. Locked premium results are rendered with teaser-only fields.
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
    .order('created_at', { ascending: false })

  if (categoryFilter) {
    query = query.eq('category', categoryFilter)
  }

  if (searchQuery) {
    const escapedQuery = searchQuery.replace(/[%_]/g, (value) => `\\${value}`)
    query = query.or(`title.ilike.%${escapedQuery}%,description.ilike.%${escapedQuery}%,location_country.ilike.%${escapedQuery}%`)
  }

  const { data: rawListings, error } = await query

  if (error) {
    console.error(error)
    return <div className="p-12 text-center text-destructive">Failed to load listings.</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketplace Catalog</h1>
          <p className="text-muted-foreground mt-1">Browse the latest hot air balloon equipment worldwide.</p>
        </div>

        <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-lg border">
          <Link href="/catalog" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!categoryFilter ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>All</Link>
          <Link href="/catalog?category=complete" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'complete' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Balloons</Link>
          <Link href="/catalog?category=envelopes" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'envelopes' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Envelopes</Link>
          <Link href="/catalog?category=baskets" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'baskets' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Baskets</Link>
          <Link href="/catalog?category=burners" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'burners' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Burners</Link>
          <Link href="/catalog?category=bottom-end" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'bottom-end' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Bottom Ends</Link>
          <Link href="/catalog?category=cylinders" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'cylinders' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Cylinders</Link>
          <Link href="/catalog?category=other-equipment" className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${categoryFilter === 'other-equipment' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Other Equipment</Link>
        </div>
      </div>

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
                  <Image src={primaryImage} alt={displayTitle} fill sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
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
            <h3 className="text-lg font-medium text-foreground">No equipment found</h3>
            <p className="text-muted-foreground mt-1">Check back later or try a different category.</p>
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
              <Link href="/sell" className="text-primary hover:underline font-medium">Have something to sell?</Link>
              <Link href="/new-balloon" className="bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                Request a new balloon quote
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
