import { createClient } from '@/utils/supabase/server'
import { forcePublishListing, deleteListing, markListingSold, promoteListing } from '../actions'
import { formatDistanceToNow } from 'date-fns'
import { Eye, Rocket, Trash2, CheckCircle2, Megaphone } from 'lucide-react'
import Link from 'next/link'
import ExportInstagramButton from '@/components/admin/ExportInstagramButton'

export default async function AdminListingsPage() {
  const supabase = await createClient()

  const { data: listings, error } = await supabase
    .from('listings')
    .select('*, users(email), images(url)')
    .order('created_at', { ascending: false })

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
              {listings?.map((l) => (
                <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 font-medium max-w-[200px] truncate">{l.title}</td>
                  <td className="px-6 py-4 text-muted-foreground">{(l.users as any)?.email || 'Unknown'}</td>
                  <td className="px-6 py-4 font-bold">{l.price.toLocaleString()} {l.currency}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold tracking-wider ${
                      l.status === 'DRAFT' ? 'bg-muted text-muted-foreground' : 
                      l.status === 'ACTIVE_PREMIUM' ? 'bg-accent/20 text-accent' : 
                      'bg-primary/20 text-primary'
                    }`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-end gap-2">
                       <Link href={`/catalog/${l.id}`} target="_blank" className="p-2 bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors" title="View Listing">
                         <Eye className="w-4 h-4" />
                       </Link>
                       <ExportInstagramButton listing={l as any} />
                       {l.status === 'DRAFT' && (
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
              {listings?.length === 0 && (
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
