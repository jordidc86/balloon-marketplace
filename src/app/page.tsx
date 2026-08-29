import Link from "next/link";
import { Search, Flame, Wind, Clock, Lock, Plane, CheckCircle2, Database, Package, Layers, SlidersHorizontal } from "lucide-react";
import { createClient, createAdminClient } from '@/utils/supabase/server';
import { formatDistanceToNow } from 'date-fns';
import { getListingVisibility, getPrimaryImageUrl, getPublicTeaserTitle, type ListingWithImages } from '@/utils/listings';
import SafeListingImage from '@/components/SafeListingImage';
import { getCatalogCategoryPath } from '@/utils/catalog-categories.mjs';

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AeroTrade | Global Hot Air Balloon Marketplace",
  description: "The private global exchange for lighter-than-air aviation. Buy and sell used hot air balloons, baskets, burners, and accessories.",
  alternates: { canonical: '/' },
  openGraph: {
    title: "AeroTrade | Global Hot Air Balloon Marketplace",
    description: "The private global exchange for lighter-than-air aviation. Buy and sell used hot air balloons, baskets, burners, and accessories.",
  }
};

export default async function Home() {
  const supabase = await createClient()
  const supabaseAdmin = await createAdminClient()

  // Increase limit to 18 to show more latest listings
  const { data: listings } = await supabaseAdmin
    .from('listings')
    .select(`
      id,
      seller_id,
      category,
      title,
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
    .limit(18);

  const { data: allActiveListings } = await supabaseAdmin
    .from('listings')
    .select('category')
    .in('status', ['ACTIVE_PUBLIC', 'ACTIVE_PREMIUM']);

  const counts: Record<string, number> = {
    complete: 0,
    envelopes: 0,
    baskets: 0,
    burners: 0,
    "bottom-end": 0,
    cylinders: 0,
    "other-equipment": 0
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

  const categories = [
    { name: 'Complete', slug: 'complete', icon: Plane, count: counts.complete },
    { name: 'Envelopes', slug: 'envelopes', icon: Wind, count: counts.envelopes },
    { name: 'Baskets', slug: 'baskets', icon: Search, count: counts.baskets },
    { name: 'Burners', slug: 'burners', icon: Flame, count: counts.burners },
    { name: 'Bottom Ends', slug: 'bottom-end', icon: Layers, count: counts["bottom-end"] },
    { name: 'Cylinders', slug: 'cylinders', icon: Database, count: counts.cylinders },
    { name: 'Other', slug: 'other-equipment', icon: Package, count: counts["other-equipment"] },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      
      {/* COMPACT SEARCH & FILTER HEADER */}
      <section className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            
            {/* Search Input */}
            <form action="/catalog" method="GET" id="searchForm" className="w-full md:max-w-md flex items-center px-4 py-2.5 bg-slate-100 rounded-full border border-slate-200 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
              <Search className="w-5 h-5 text-slate-400 mr-2 shrink-0" />
              <input 
                type="text" 
                name="q"
                placeholder="Search listings..." 
                className="w-full bg-transparent border-none focus:ring-0 text-foreground outline-none placeholder:text-slate-500 text-sm"
              />
              <button type="submit" className="hidden"></button>
            </form>

            {/* Category Pills (Desktop & Scrollable Mobile) */}
            <div className="w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide flex items-center gap-2">
              <Link 
                href="/catalog" 
                className="flex items-center gap-2 px-4 py-2 rounded-full border bg-white hover:bg-slate-50 text-sm font-medium whitespace-nowrap transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4" /> All
              </Link>
              {categories.map((cat) => (
                <Link 
                  href={getCatalogCategoryPath(cat.slug)}
                  key={cat.name} 
                  className="flex items-center gap-2 px-4 py-2 rounded-full border bg-white hover:bg-slate-50 text-sm font-medium whitespace-nowrap transition-colors"
                >
                  <cat.icon className="w-4 h-4 text-primary" />
                  {cat.name}
                  <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full ml-1">{cat.count}</span>
                </Link>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* PREMIUM BANNER */}
      <section className="bg-amber-50/80 border-b border-amber-200/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 rounded-full bg-amber-500/20 items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </span>
            <p className="text-sm font-medium text-slate-700">
              <strong className="text-amber-800">Premium Advantage:</strong> Members get 48 hours early access to all new gear.
            </p>
          </div>
          <Link href="/pricing" className="text-sm font-bold text-amber-700 hover:bg-amber-500/10 px-4 py-1.5 rounded-full transition-colors whitespace-nowrap">
            Unlock Premium &rarr;
          </Link>
        </div>
      </section>

      {/* LATEST LISTINGS */}
      <section className="py-10 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Latest Arrivals</h1>
              <p className="text-slate-500 mt-2">Discover the newest equipment hitting the global market.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(listings as ListingWithImages[] | null)?.map((listing) => {
              const { isPremiumExclusive, canViewFully } = getListingVisibility(listing, user?.id, isPremium)
              const primaryImage = canViewFully ? getPrimaryImageUrl(listing) : null
              const displayTitle = canViewFully ? listing.title : getPublicTeaserTitle(listing.category)
              const displayPrice = canViewFully
                ? listing.price === 0 ? 'Inquire' : `€${Number(listing.price).toLocaleString()}`
                : 'Premium Exclusive'
              const publicAtLabel = listing.public_at
                ? formatDistanceToNow(new Date(listing.public_at))
                : 'soon'

              if (!canViewFully) {
                return (
                  <div key={listing.id} className="rounded-2xl border bg-white overflow-hidden group flex flex-col h-full relative shadow-sm">
                    <div className="h-56 bg-slate-200 relative overflow-hidden flex items-center justify-center shrink-0">
                      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-white px-4 text-center">
                        <Lock className="w-8 h-8 mb-2 text-amber-400" />
                        <span className="font-bold tracking-tight text-sm text-amber-400">PREMIUM EXCLUSIVE</span>
                        <p className="text-xs mt-1 text-slate-300">Public in {publicAtLabel}</p>
                      </div>
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{listing.category.replace('-', ' ')}</span>
                      </div>
                      <h3 className="font-bold text-lg mb-1 line-clamp-2 text-slate-400">{displayTitle}</h3>
                      <p className="text-xl font-extrabold text-slate-900 mb-4 text-slate-400">{displayPrice}</p>
                    </div>
                  </div>
                )
              }

              return (
                <Link href={`/catalog/${listing.id}`} key={listing.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col h-full relative">
                  <div className="h-56 bg-slate-100 relative overflow-hidden flex items-center justify-center shrink-0">
                    {primaryImage ? (
                      <SafeListingImage src={primaryImage} alt={displayTitle} sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <Search className="w-8 h-8 text-slate-300" />
                    )}
                    {isPremiumExclusive && (
                      <div className="absolute top-3 right-3 bg-amber-400 text-amber-900 text-[10px] font-bold px-2.5 py-1 rounded-md shadow-sm uppercase tracking-wider">
                        Premium Active
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-3">
                        <span className="text-xs font-bold text-primary uppercase tracking-wider">{listing.category.replace('-', ' ')}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-1 rounded-md">{listing.condition}</span>
                    </div>
                    <h3 className="font-bold text-lg leading-tight mb-2 line-clamp-2 group-hover:text-primary transition-colors">{displayTitle}</h3>
                    <p className="text-2xl font-extrabold text-slate-900 mb-4">{displayPrice}</p>
                    <div className="mt-auto w-full pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500">
                      <span className="truncate pr-4">{listing.location_country}</span>
                      <span className="whitespace-nowrap shrink-0">{formatDistanceToNow(new Date(listing.created_at))} ago</span>
                    </div>
                  </div>
                </Link>
              )
            })}

            {listings?.length === 0 && (
              <div className="col-span-full py-20 text-center flex flex-col items-center bg-white rounded-2xl border border-dashed border-slate-300">
                <Search className="w-12 h-12 text-slate-300 mb-4" />
                <h3 className="text-lg font-bold text-slate-900">No listings found</h3>
                <p className="text-slate-500 max-w-lg mt-1 mb-6">There are currently no matching used listings. AeroTrade can still source a factory-new Pasha or Schroeder balloon and prepare an indicative budget.</p>
                <div className="flex flex-col gap-3 sm:flex-row"><Link href="/new-balloon?source=catalog-empty" className="bg-primary hover:bg-primary/90 text-white font-medium px-6 py-2.5 rounded-full transition-colors shadow-sm">Get a New Balloon Budget</Link><Link href="/sell" className="border border-slate-300 bg-white px-6 py-2.5 rounded-full font-medium text-slate-700 hover:border-primary hover:text-primary">List Your Equipment</Link></div>
              </div>
            )}
          </div>
          
          {listings && listings.length >= 18 && (
            <div className="mt-12 flex justify-center">
              <Link href="/catalog" className="bg-white border border-slate-200 hover:border-primary hover:text-primary text-slate-700 font-medium px-8 py-3 rounded-full transition-all shadow-sm">
                View All Equipment
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="border-t bg-white py-10">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center lg:px-8">
          <div><p className="text-sm font-bold uppercase tracking-wider text-primary">Used or new</p><h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">Do not stop because today’s catalog is not the right fit.</h2><p className="mt-3 max-w-3xl text-slate-600">Tell AeroTrade what used equipment you need, or request an approximate price direction for a new Pasha or Schroeder balloon. The commercial path continues either way.</p></div>
          <div className="flex flex-col gap-3 sm:flex-row"><Link href="/wanted" className="rounded-xl border border-slate-300 px-5 py-3 text-center font-bold text-slate-800 hover:border-primary hover:text-primary">Find used equipment</Link><Link href="/new-balloon?source=home" className="rounded-xl bg-primary px-5 py-3 text-center font-bold text-white hover:bg-primary/90">Buy a new balloon</Link></div>
        </div>
      </section>

      {/* FOOTER INFO SECTION */}
      <section className="bg-slate-900 text-white py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex flex-col md:flex-row items-center justify-center gap-8 text-sm text-slate-400 font-medium tracking-wide">
            <span className="flex items-center gap-2"><Lock className="w-5 h-5 text-emerald-400" /> Contact details strictly protected</span>
            <span className="hidden md:block text-slate-700">•</span>
            <span className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-blue-400" /> Listings can be reported and moderated</span>
          </div>
          <p className="mt-8 text-slate-500 text-xs">
            © {new Date().getFullYear()} AeroTrade. The private global exchange for lighter-than-air aviation.
          </p>
        </div>
      </section>

    </div>
  );
}
