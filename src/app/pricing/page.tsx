import { createClient } from '@/utils/supabase/server'
import { Check, Plane, Lock, Bell, Star } from 'lucide-react'
import { createPremiumCheckout } from './actions'
import { redirect } from 'next/navigation'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Pricing | AeroTrade Marketplace',
  description: 'Join AeroTrade Premium to get a 48-hour head start on every single hot air balloon equipment listing worldwide.',
}

export default async function PricingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let isPremium = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
    isPremium = profile?.is_premium || false
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">The unfair advantage.</h1>
        <p className="text-xl text-muted-foreground text-balance max-w-2xl mx-auto">
          The best equipment never hits the public market. Join AeroTrade Premium to get a 48-hour head start on every single listing worldwide.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        
        {/* Free Tier */}
        <div className="border bg-card rounded-3xl p-8 h-full">
          <h2 className="text-2xl font-bold mb-2 text-foreground">Basic Access</h2>
          <div className="text-4xl font-black mb-6">€ 0 <span className="text-lg text-muted-foreground font-medium">/ forever</span></div>
          
          <ul className="space-y-4 mb-8 text-muted-foreground">
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-foreground" /> <span>Browse public listings</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-foreground" /> <span>List items for sale (5€ fee)</span></li>
            <li className="flex items-start gap-3 opacity-50"><Lock className="w-5 h-5 shrink-0" /> <span>No access to active premium listings</span></li>
            <li className="flex items-start gap-3 opacity-50"><Lock className="w-5 h-5 shrink-0" /> <span>No instant email alerts</span></li>
          </ul>

          <div className="mt-8 p-4 bg-muted/40 rounded-xl text-sm border font-medium text-center">
             Included by default
          </div>
        </div>

        {/* Premium Tier */}
        <div className="border-2 border-primary bg-primary/5 rounded-3xl p-8 relative shadow-lg transform md:-translate-y-4">
          <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
            <Star className="w-4 h-4" /> Recommended
          </div>
          <h2 className="text-2xl font-bold mb-2 text-foreground">Premium Club</h2>
          <div className="text-5xl font-black mb-6 text-foreground">€ 9.99 <span className="text-lg text-muted-foreground font-medium">/ year</span></div>
          
          <ul className="space-y-4 mb-8 text-foreground font-medium">
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>48-Hour Early Access to all new listings</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>Instant Email Alerts for new gear</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>Secure contact info reveal</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>Premium badge on your profile</span></li>
          </ul>

          <div className="mt-auto">
            {!user ? (
               <form action={async () => { 'use server'; redirect('/login?redirectTo=/pricing') }}>
                <button className="w-full bg-foreground text-background hover:bg-foreground/90 py-4 rounded-xl font-bold text-lg transition-all shadow-md">
                   Login to Upgrade
                </button>
               </form>
            ) : isPremium ? (
              <button disabled className="w-full bg-primary/20 text-primary py-4 rounded-xl font-bold text-lg cursor-not-allowed">
                 You are already Premium
              </button>
            ) : (
              <form action={createPremiumCheckout}>
                <button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-4 rounded-xl font-bold text-lg transition-all shadow-md hover:shadow-xl hover:-translate-y-1 flex items-center justify-center gap-2">
                  <Plane className="w-5 h-5" /> 
                  Subscribe Now
                </button>
              </form>
            )}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-4">Billed annually. Cancel anytime.</p>
        </div>

      </div>
    </div>
  )
}
