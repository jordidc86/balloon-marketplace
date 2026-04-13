import Link from "next/link";
import { Search, Flame, Wind, Clock, Lock, Plane } from "lucide-react";
import { createClient } from '@/utils/supabase/server';
import { formatDistanceToNow } from 'date-fns';

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AeroTrade | Global Hot Air Balloon Marketplace",
  description: "The private global exchange for lighter-than-air aviation. Buy and sell used hot air balloons, baskets, burners, and accessories.",
  openGraph: {
    title: "AeroTrade | Global Hot Air Balloon Marketplace",
    description: "The private global exchange for lighter-than-air aviation. Buy and sell used hot air balloons, baskets, burners, and accessories.",
  }
};

export default async function Home() {
  const supabase = await createClient()

  const { data: listings } = await supabase
    .from('listings')
    .select(`
      *,
      images (url, is_primary)
    `)
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM'])
    .order('created_at', { ascending: false })
    .limit(3);

  const { data: allActiveListings } = await supabase
    .from('listings')
    .select('category')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM']);

  const counts: Record<string, number> = {
    complete: 0,
    envelopes: 0,
    baskets: 0,
    burners: 0
  };

  if (allActiveListings) {
    allActiveListings.forEach(l => {
      if (counts[l.category] !== undefined) {
        counts[l.category]++;
      }
    });
  }

  const { data: { user } } = await supabase.auth.getUser()
  let isPremium = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
    isPremium = profile?.is_premium || false
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* HERO SECTION */}
      <section className="relative w-full h-[600px] flex items-center justify-center bg-slate-900 border-b overflow-hidden">
        {/* Abstract/Dark background for the hero instead of an image to keep MVP fast, uses nice gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 z-0 opacity-90" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent z-0" />
        
        <div className="relative z-10 w-full max-w-4xl px-4 text-center">
          <h1 className="text-4xl md:text-6xl font-extrabold text-white tracking-tight text-balance mb-6">
            The Global Market for Used Hot Air Balloon Equipment.
          </h1>
          <p className="text-lg md:text-xl text-slate-300 mb-10 max-w-2xl mx-auto text-balance">
            Discover rare envelopes, premium baskets, and trusted burners. Join the private exchange where the best gear moves first.
          </p>
          
          <div className="bg-background/95 backdrop-blur-md p-2 rounded-2xl shadow-xl flex flex-col md:flex-row gap-2 max-w-3xl mx-auto">
            <form action="/catalog" method="GET" id="searchForm" className="flex-1 flex items-center px-4 bg-muted/50 rounded-xl">
              <Search className="w-5 h-5 text-muted-foreground mr-2" />
              <input 
                type="text" 
                name="q"
                placeholder="Search 'Cameron Z-105' or 'Double Burner'..." 
                className="w-full bg-transparent border-none focus:ring-0 py-3 text-foreground outline-none"
              />
            </form>
            <select name="category" form="searchForm" className="px-4 py-3 bg-muted/50 rounded-xl text-foreground font-medium md:w-48 outline-none border-t md:border-t-0 md:border-l border-border mt-2 md:mt-0">
              <option value="">All Categories</option>
              <option value="complete">Complete</option>
              <option value="envelopes">Envelopes</option>
              <option value="baskets">Baskets</option>
              <option value="burners">Burners</option>
            </select>
            <button form="searchForm" type="submit" className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-8 py-3 rounded-xl transition-colors mt-2 md:mt-0">
              Search
            </button>
          </div>
        </div>
      </section>

      {/* PREMIUM BANNER */}
      <section className="bg-accent/10 border-b border-accent/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 rounded-full bg-accent/20 items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-accent-foreground" />
            </span>
            <p className="text-sm font-medium text-foreground">
              <strong className="text-accent-foreground">The Unfair Advantage:</strong> Premium members get 48 hours early access to all new listings.
            </p>
          </div>
          <Link href="/pricing" className="text-sm font-semibold text-accent-foreground hover:bg-accent/20 px-4 py-2 rounded-full transition-colors whitespace-nowrap">
            Unlock Premium Access &rarr;
          </Link>
        </div>
      </section>

      {/* CATEGORIES GRID */}
      <section className="py-16 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold mb-8">Browse Categories</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Complete Balloons', slug: 'complete', icon: Plane, count: counts.complete },
              { name: 'Envelopes', slug: 'envelopes', icon: Wind, count: counts.envelopes },
              { name: 'Baskets', slug: 'baskets', icon: Search, count: counts.baskets },
              { name: 'Burners', slug: 'burners', icon: Flame, count: counts.burners },
            ].map((cat) => (
              <Link href={`/catalog?category=${cat.slug}`} key={cat.name} className="group p-6 rounded-2xl border bg-card hover:border-primary/50 hover:shadow-sm transition-all text-center flex flex-col items-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <cat.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold">{cat.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{cat.count} Active</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* RECENT / FEATURED LISTINGS */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h2 className="text-2xl font-bold">Recently Added Gear</h2>
              <p className="text-muted-foreground mt-1 text-sm">The latest equipment listed by pilots worldwide.</p>
            </div>
            <Link href="/catalog" className="text-sm font-medium text-primary hover:underline">
              View All &rarr;
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {listings?.map((listing: any) => {
              const isPremiumExclusive = new Date() < new Date(listing.public_at)
              const isOwner = user?.id === listing.seller_id
              const canViewFully = !isPremiumExclusive || isPremium || isOwner
              const primaryImage = listing.images?.find((img: any) => img.is_primary)?.url || listing.images?.[0]?.url

              if (!canViewFully) {
                return (
                  <div key={listing.id} className="rounded-2xl border bg-card overflow-hidden group flex flex-col h-full relative">
                    <div className="h-48 bg-slate-200 relative overflow-hidden flex items-center justify-center shrink-0">
                      {primaryImage && (
                        <img src={primaryImage} alt="Blurred decorative background" className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-40" />
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
                      </div>
                      <h3 className="font-bold text-lg mb-1 line-clamp-2 blur-sm select-none text-muted">{listing.title}</h3>
                      <p className="text-xl font-extrabold text-foreground mb-4 blur-sm select-none text-muted">€ {listing.price}</p>                    </div>
                  </div>
                )
              }

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
                    <p className="text-xl font-extrabold text-foreground mb-4">€ {listing.price.toLocaleString()}</p>
                    <div className="mt-auto w-full pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
                      <span>{listing.location_country}</span>
                      <span>{formatDistanceToNow(new Date(listing.created_at))} ago</span>
                    </div>
                  </div>
                </Link>
              )
            })}

            {listings?.length === 0 && (
              <div className="col-span-full py-20 text-center flex flex-col items-center">
                <p className="text-muted-foreground">No dynamic listings found.</p>
                <Link href="/sell" className="mt-4 text-primary font-medium hover:underline">Add yours now!</Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
