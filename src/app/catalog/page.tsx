import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { Flame, Wind, Search, Lock, Filter } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()
  const params = await searchParams
  
  const categoryFilter = typeof params.category === 'string' ? params.category : null

  // Fetch current user & premium status
  const { data: { user } } = await supabase.auth.getUser()
  let isPremium = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
    isPremium = profile?.is_premium || false
  }

  // Fetch active listings
  let query = supabase
    .from('listings')
    .select(`
      *,
      images (url, is_primary)
    `)
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
    .order('created_at', { ascending: false })

  if (categoryFilter) {
    query = query.eq('category', categoryFilter)
  }

  const { data: listings, error } = await query

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
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {listings?.map((listing) => {
          const isPremiumExclusive = new Date() < new Date(listing.public_at)
          const isOwner = user?.id === listing.seller_id
          const canViewFully = !isPremiumExclusive || isPremium || isOwner

          const primaryImage = listing.images?.find((img: any) => img.is_primary)?.url || listing.images?.[0]?.url

          if (!canViewFully) {
            // RENDER LOCKED / BLURRED CARD FOR NON-PREMIUM USERS
            return (
              <div key={listing.id} className="rounded-2xl border bg-card overflow-hidden group flex flex-col h-full relative">
                <div className="h-48 bg-slate-200 relative overflow-hidden flex items-center justify-center shrink-0">
                  {primaryImage && (
                    <img src={primaryImage} alt={listing.title} className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-40" />
                  )}
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-white px-4 text-center">
                    <Lock className="w-8 h-8 mb-2 text-accent" />
                    <span className="font-bold tracking-tight text-sm">PREMIUM EXCLUSIVE</span>
                    <p className="text-xs mt-1 text-slate-300">Public in {formatDistanceToNow(new Date(listing.public_at))}</p>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{listing.category}</span>
                    <span className="text-[10px] font-bold bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full ring-1 ring-accent/30">Locked</span>
                  </div>
                  {/* Masking Title & Precise Price */}
                  <h3 className="font-bold text-lg mb-1 line-clamp-2 blur-[4px] select-none text-muted">{listing.title}</h3>
                  <p className="text-xl font-extrabold text-foreground mb-4 blur-[4px] select-none text-muted">€ {listing.price}</p>
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
                  <img src={primaryImage} alt={listing.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
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
                <h3 className="font-bold text-lg mb-1 line-clamp-2 group-hover:text-primary transition-colors">{listing.title}</h3>
                <p className="text-xl font-extrabold text-foreground mb-4">{listing.price.toLocaleString()} {listing.currency}</p>
                
                <div className="mt-auto w-full pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
                  <span className="truncate pr-2">{listing.location_country}</span>
                  <span className="shrink-0">{formatDistanceToNow(new Date(listing.created_at))} ago</span>
                </div>
              </div>
            </Link>
          )
        })}

        {listings?.length === 0 && (
          <div className="col-span-full py-20 text-center flex flex-col items-center">
            <Filter className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground">No equipment found</h3>
            <p className="text-muted-foreground mt-1">Check back later or try a different category.</p>
            <Link href="/sell" className="mt-6 text-primary hover:underline font-medium">Have something to sell?</Link>
          </div>
        )}
      </div>
    </div>
  )
}
