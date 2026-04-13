import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import SellForm from '@/components/SellForm'

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?error=' + encodeURIComponent('You must be logged in to edit a listing.'))
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

  // Verify Ownership
  if (user.id !== listing.seller_id) {
    redirect('/catalog/' + id + '?error=' + encodeURIComponent('You are not authorized to edit this listing.'))
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8 border-b pb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Edit Listing</h1>
        <p className="text-muted-foreground">Update your equipment details and listing information.</p>
      </div>

      <SellForm userId={user.id} initialData={listing} />
    </div>
  )
}
