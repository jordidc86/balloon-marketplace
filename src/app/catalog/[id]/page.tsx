import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { Lock, MapPin, Tag, Calendar, Activity, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import ContactSeller from './ContactSeller'
import { Metadata } from 'next'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data: listing } = await supabase.from('listings').select('title, description').eq('id', id).single()

  if (!listing) {
    return { title: 'Listing Not Found | AeroTrade' }
  }

  return {
    title: `${listing.title} | AeroTrade Marketplace`,
    description: listing.description?.substring(0, 160) || `Buy ${listing.title} on AeroTrade.`,
  }
}

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  let isPremium = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
    isPremium = profile?.is_premium || false
  }

  // Fetch Listing
  const { data: listing, error } = await supabase
    .from('listings')
    .select('*, images(url, is_primary)')
    .eq('id', id)
    .single()

  if (error || !listing) {
    notFound()
  }

  // Determine visibility rights
  const isPremiumExclusive = new Date() < new Date(listing.public_at) && listing.status === 'ACTIVE_PREMIUM'
  const isOwner = user?.id === listing.seller_id
  const canViewFully = !isPremiumExclusive || isPremium || isOwner

  const images = listing.images?.map((img: any) => img.url) || []

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Schema.org Product Data */}
      {canViewFully && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org/",
              "@type": "Product",
              "name": listing.title,
              "image": images,
              "description": listing.description,
              "offers": {
                "@type": "Offer",
                "url": `https://aerotrade-mvp-app.netlify.app/catalog/${listing.id}`,
                "priceCurrency": listing.currency || "EUR",
                "price": listing.price,
                "itemCondition": "https://schema.org/UsedCondition",
                "availability": "https://schema.org/InStock"
              }
            })
          }}
        />
      )}

      {/* Premium Teaser Bar */}
      {isPremiumExclusive && !canViewFully && (
        <div className="bg-accent text-accent-foreground p-4 rounded-xl mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 shrink-0" />
            <p className="font-medium text-sm sm:text-base">
              This listing is in the 48-hour Premium Exclusive window. It will be public in {formatDistanceToNow(new Date(listing.public_at))}.
            </p>
          </div>
          <Link href="/pricing" className="bg-background text-foreground hover:bg-muted px-6 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors">
            Unlock Now
          </Link>
        </div>
      )}

      {isPremiumExclusive && canViewFully && !isOwner && (
        <div className="bg-primary/10 text-primary border border-primary/20 p-4 rounded-xl mb-8 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <p className="font-medium text-sm">
            You are viewing this listing securely within the 48-hour Premium window.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left: Images */}
        <div className="space-y-4">
          <div className="relative aspect-video sm:aspect-square lg:aspect-[4/3] bg-muted rounded-2xl overflow-hidden border">
            {images.length > 0 ? (
              <img 
                src={images[0]} 
                alt={listing.title} 
                className={`w-full h-full object-cover transition-all duration-700 ${!canViewFully ? 'blur-xl scale-110 opacity-60' : ''}`}
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
                <div key={idx} className="w-24 h-24 shrink-0 rounded-xl overflow-hidden border bg-muted">
                  <img src={img} className={`w-full h-full object-cover ${!canViewFully ? 'blur-md' : ''}`} alt={`Thumbnail ${idx + 1} for ${listing.title}`} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Details */}
        <div className="flex flex-col">
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted px-3 py-1 rounded-full">{listing.category}</span>
              <span className="text-xs font-bold text-secondary-foreground bg-secondary px-3 py-1 rounded-full">{listing.condition}</span>
            </div>
            
            <h1 className={`text-3xl sm:text-4xl font-extrabold tracking-tight mb-4 ${!canViewFully ? 'blur-sm select-none opacity-80' : ''}`}>
              {listing.title}
            </h1>
            
            <p className={`text-4xl font-black text-foreground ${!canViewFully ? 'blur-sm select-none opacity-80' : ''}`}>
              {listing.price.toLocaleString()} {listing.currency}
            </p>
            <p className="text-muted-foreground flex items-center mt-2">
              <MapPin className="w-4 h-4 mr-1" /> {listing.location_country}
            </p>
          </div>

          <div className="bg-card border rounded-2xl p-6 mb-8 flex-1">
            <h3 className="text-lg font-bold mb-4 border-b pb-2">Equipment Details</h3>
            
            <div className={`grid grid-cols-2 gap-y-4 gap-x-8 text-sm ${!canViewFully ? 'blur-sm select-none opacity-60' : ''}`}>
              {listing.details?.manufacturer && (
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1">Manufacturer</span><span className="font-medium text-base">{listing.details.manufacturer}</span></div>
              )}
              {listing.details?.model && (
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1">Model/Volume</span><span className="font-medium text-base">{listing.details.model}</span></div>
              )}
              {listing.details?.year && (
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1"><Calendar className="w-3 h-3 inline mr-1"/>Year</span><span className="font-medium text-base">{listing.details.year}</span></div>
              )}
              {listing.details?.hours && (
                <div><span className="text-primary block text-xs font-bold uppercase tracking-wider mb-1"><Activity className="w-3 h-3 inline mr-1"/>Total Hours</span><span className="font-bold text-base">{listing.details.hours}</span></div>
              )}
              {listing.details?.dimensions && (
                <div><span className="text-muted-foreground block text-xs uppercase tracking-wider mb-1">Dimensions</span><span className="font-medium text-base">{listing.details.dimensions}</span></div>
              )}
            </div>

            <div className={`mt-8 ${!canViewFully ? 'blur-sm select-none opacity-60' : ''}`}>
              <span className="text-muted-foreground block text-xs uppercase tracking-wider mb-2">Description</span>
              <p className="whitespace-pre-wrap text-foreground/90 leading-relaxed">{listing.description}</p>
            </div>
          </div>

          {/* Contact Action */}
          <div className="mt-auto">
            {!canViewFully ? (
              <Link href="/pricing" className="w-full flex justify-center items-center gap-2 bg-accent text-accent-foreground py-4 rounded-xl font-bold text-lg hover:opacity-90 transition-opacity">
                <Lock className="w-5 h-5" />
                Upgrade to Contact Seller
              </Link>
            ) : isOwner ? (
               <div className="space-y-3">
                 <div className="w-full text-center p-4 bg-muted text-muted-foreground rounded-xl font-medium border">
                   This is your listing.
                 </div>
                 <Link href={`/catalog/${listing.id}/edit`} className="w-full flex justify-center items-center gap-2 bg-primary text-primary-foreground py-4 rounded-xl font-bold text-lg hover:bg-primary/90 transition-all shadow-md">
                   Edit Listing Details & Photos
                 </Link>
               </div>
            ) : (
              <ContactSeller 
                listingId={listing.id} 
                email={listing.contact_email} 
                phone={listing.contact_phone} 
              />
            )}
          </div>
          
        </div>
      </div>
    </div>
  )
}
