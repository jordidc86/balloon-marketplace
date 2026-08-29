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
  
  let isPremium = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
    isPremium = profile?.is_premium || false
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-8 border-b pb-6">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Create a Listing</h1>
        <p className="text-muted-foreground">List your equipment on the global exchange. Publish for free, or upgrade the listing to Premium promotion at the end.</p>
        
        <div className="mt-6 bg-accent/10 border border-accent/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="bg-accent/20 text-accent-foreground w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold">€5</div>
          <div>
            <h3 className="font-semibold text-foreground">Free or Premium listing</h3>
            <p className="text-sm text-muted-foreground">Free listings publish directly. Premium listings cost 5 EUR and include the 48-hour Premium window, newsletter, social promotion and personal buyer outreach.</p>
          </div>
        </div>
        {isPremium && (
          <p className="mt-3 text-sm text-muted-foreground">
            Your Premium membership gives you early buyer access. Listing promotion is purchased separately.
          </p>
        )}
      </div>

      <SellForm userId={user?.id || null} defaultContactEmail={user?.email || null} />
    </div>
  )
}
