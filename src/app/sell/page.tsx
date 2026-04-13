import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import SellForm from '@/components/SellForm'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Post a Listing | AeroTrade Marketplace',
  description: 'List your hot air balloon equipment on the global exchange and reach buyers worldwide.',
}

export default async function SellPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?error=' + encodeURIComponent('You must be logged in to post a listing.'))
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8 border-b pb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Create a Listing</h1>
        <p className="text-muted-foreground">List your equipment on the global exchange.</p>
        
        <div className="mt-6 bg-accent/10 border border-accent/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="bg-accent/20 text-accent-foreground w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold">€ 5</div>
          <div>
            <h3 className="font-semibold text-foreground">One-time listing fee</h3>
            <p className="text-sm text-muted-foreground">Your listing will be reviewed and then enter the exclusive 48-hour Premium Window before becoming public to everyone.</p>
          </div>
        </div>
      </div>

      <SellForm userId={user.id} />
    </div>
  )
}
