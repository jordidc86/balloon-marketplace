import { createAdminClient } from '@/utils/supabase/server'
import { forcePublishListing, deleteListing, markListingSold, promoteListing, setListingVerification } from '../actions'
import { formatDistanceToNow } from 'date-fns'
import { Eye, Rocket, Trash2, CheckCircle2, Megaphone, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import ExportInstagramButton from '@/components/admin/ExportInstagramButton'
import { getStoredListingPublicationIssues } from '@/utils/listing-submission.mjs'

export const dynamic = 'force-dynamic'

type AdminListingImage = {
  url: string
  is_primary?: boolean | null
  created_at?: string | null
}

type AdminListing = {
  id: string
  title: string
  price: number
  currency: string
  status: string
  created_at: string
  users?: { email?: string | null } | null
  images?: AdminListingImage[] | null
  listing_verifications?: { status?: string | null }[] | null
  listing_quality_state?: { status?: string | null; consecutive_failures?: number | null }[] | null
  category: string
  details?: ({ hours?: string | number } & Record<string, unknown>) | null
}

export default async function AdminListingsPage() {
  const supabase = await createAdminClient()

  const { data: listings, error } = await supabase
    .from('listings')
    .select('*, users(email), images(url, is_primary, created_at), listing_verifications(status), listing_quality_state(status, consecutive_failures)')
    .order('created_at', { ascending: false })

  const typedListings = listings as AdminListing[] | null

  if (error) {
    return <div className="p-4 bg-destructive/10 text-destructive rounded-xl">Error loading listings.</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Manage Listings</h1>
        <p className="text-muted-foreground mt-1">Review marketplace submissions, force publish, or moderate content.</p>
      </div>

      <div className="bg-card border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-4 font-semibold">Title</th>
                <th className="px-6 py-4 font-semibold">Seller Email</th>
                <th className="px-6 py-4 font-semibold">Price</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Created</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {typedListings?.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium max-w-[240px]">
                    <p className="truncate">{l.title}</p>
                    {getStoredListingPublicationIssues(l).length > 0 ? <p className="mt-1 text-xs font-semibold text-amber-700">Missing: {getStoredListingPublicationIssues(l).join(', ')}</p> : null}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{l.users?.email || 'Unknown'}</td>
                  <td className="px-6 py-4 font-bold">{l.price.toLocaleString()} {l.currency}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold tracking-wider ${
                      l.status === 'DRAFT' || l.status === 'PENDING_PAYMENT' ? 'bg-muted text-muted-foreground' :
                      l.status === 'ACTIVE_PREMIUM' ? 'bg-accent/20 text-accent' :
                      'bg-primary/20 text-primary'
                    }`}>
                      {l.status}
                    </span>
                    {l.listing_quality_state?.[0]?.status === 'QUARANTINED' ? (
                      <span className="ml-2 rounded-md bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">PHOTOS PAUSED</span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                       <Link href={`/catalog/${l.id}`} target="_blank" className="p-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors" title="View Listing">
                         <Eye className="w-4 h-4" />
                       </Link>
                       <ExportInstagramButton
                         listing={{
                           ...l,
                           details: l.details || undefined,
                           images: [...(l.images || [])].sort((a, b) => {
                             if (a.is_primary && !b.is_primary) return -1
                             if (!a.is_primary && b.is_primary) return 1
                             return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
                           }),
                         }}
                       />
                       {l.listing_verifications?.[0]?.status === 'VERIFIED' ? (
                         <form action={setListingVerification.bind(null, l.id)}>
                           <input type="hidden" name="verification_action" value="unverify" />
                           <button className="p-2 rounded-lg bg-emerald-500/15 text-emerald-700 transition-colors flex items-center gap-1.5 font-semibold text-xs" title="Remove the document-review badge">
                             <ShieldCheck className="w-3.5 h-3.5" /> Verified
                           </button>
                         </form>
                       ) : (
                         <details className="relative">
                           <summary className="list-none cursor-pointer p-2 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors flex items-center gap-1.5 font-semibold text-xs" title="Document review status — not an airworthiness inspection">
                             <ShieldCheck className="w-3.5 h-3.5" /> Review
                           </summary>
                           <form action={setListingVerification.bind(null, l.id)} className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border bg-card p-4 text-left shadow-xl whitespace-normal">
                             <input type="hidden" name="verification_action" value="verify" />
                             <p className="font-semibold">Document-check gate</p>
                             <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="identity_checked" value="yes" required className="mt-0.5" /> Seller identity has been reviewed.</label>
                             <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="supporting_documents_checked" value="yes" required className="mt-0.5" /> Supporting listing evidence has been reviewed.</label>
                             <p className="text-xs text-muted-foreground">This does not certify ownership, airworthiness or physical condition.</p>
                             <button className="w-full rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background">Publish badge</button>
                           </form>
                         </details>
                       )}
                       {(l.status === 'DRAFT' || l.status === 'PENDING_PAYMENT') && (
                         <form action={async () => {
                           'use server'
                           await forcePublishListing(l.id)
                         }}>
                           <button className="p-2 bg-accent/10 text-accent hover:bg-accent/20 rounded-lg transition-colors flex items-center gap-1.5 font-semibold text-xs" title="Bypass Stripe and Publish">
                             <Rocket className="w-3.5 h-3.5" /> Publish
                           </button>
                         </form>
                       )}
                       {l.status !== 'SOLD' && (
                         <form action={async () => {
                           'use server'
                           await markListingSold(l.id)
                         }}>
                           <button className="p-2 bg-green-500/10 text-green-600 hover:bg-green-500/20 rounded-lg transition-colors flex items-center gap-1.5 font-semibold text-xs" title="Mark as Sold">
                             <CheckCircle2 className="w-3.5 h-3.5" /> Sold
                           </button>
                         </form>
                       )}
                       {l.status === 'ACTIVE_PREMIUM' && (
                         <form action={async () => {
                           'use server'
                           await promoteListing(l.id)
                         }}>
                           <button className="p-2 bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 rounded-lg transition-colors flex items-center gap-1.5 font-semibold text-xs" title="Email alert to premium users">
                             <Megaphone className="w-3.5 h-3.5" /> Promote
                           </button>
                         </form>
                       )}
                       <form action={async () => {
                         'use server'
                         await deleteListing(l.id)
                       }}>
                         <button className="p-2 bg-destructive/10 text-destructive hover:bg-destructive/20 rounded-lg transition-colors" title="Delete Listing">
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </form>
                    </div>
                  </td>
                </tr>
              ))}
              {typedListings?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No listings found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
