import { createClient } from '@/utils/supabase/server'
import { Check, Plane, Lock, Star } from 'lucide-react'
import { createPremiumCheckout } from './actions'
import { redirect } from 'next/navigation'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Buyer Early Access | AeroTrade Marketplace',
  description: 'Get 48-hour early buyer access and instant alerts for new hot air balloon equipment listings for 9.99 EUR per year.',
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
        <p className="mb-3 text-sm font-bold uppercase tracking-wider text-primary">Annual buyer product</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">See new equipment 48 hours earlier.</h1>
        <p className="text-xl text-muted-foreground text-balance max-w-2xl mx-auto">
          AeroTrade Buyer Early Access gives buyers a 48-hour head start on promoted listings and immediate email alerts when new equipment appears.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        
        {/* Free Tier */}
        <div className="border bg-card rounded-3xl p-8 h-full">
          <h2 className="text-2xl font-bold mb-2 text-foreground">Basic Access</h2>
          <div className="text-4xl font-black mb-6">€ 0 <span className="text-lg text-muted-foreground font-medium">/ forever</span></div>
          
          <ul className="space-y-4 mb-8 text-muted-foreground">
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-foreground" /> <span>Browse public listings</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-foreground" /> <span>Publish free listings</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-foreground" /> <span>Optional 5 EUR one-time Seller Launch Promotion</span></li>
            <li className="flex items-start gap-3 opacity-50"><Lock className="w-5 h-5 shrink-0" /> <span>No access during the 48-hour buyer window</span></li>
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
          <h2 className="text-2xl font-bold mb-2 text-foreground">Buyer Early Access</h2>
          <div className="text-5xl font-black mb-6 text-foreground">€ 9.99 <span className="text-lg text-muted-foreground font-medium">/ year</span></div>
          
          <ul className="space-y-4 mb-8 text-foreground font-medium">
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>48-hour early access to promoted listings</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>Instant Email Alerts for new gear</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>Secure contact info reveal</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>Self-service subscription management</span></li>
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
                 Buyer Early Access is active
              </button>
            ) : (
              <form action={createPremiumCheckout}>
                <button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-4 rounded-xl font-bold text-lg transition-all shadow-md hover:shadow-xl hover:-translate-y-1 flex items-center justify-center gap-2">
                  <Plane className="w-5 h-5" /> 
                  Get Buyer Early Access
                </button>
              </form>
            )}
          </div>
          <p className="text-xs text-center text-muted-foreground mt-4">9.99 EUR billed annually. Cancel anytime. This is separate from the one-time seller promotion.</p>
        </div>

      </div>

      <div className="mt-24 max-w-3xl mx-auto border-t pt-12">
        <h3 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h3>
        <div className="space-y-6">
          <div>
            <h4 className="font-semibold text-lg text-foreground">How does the 48-Hour Early Access work?</h4>
            <p className="text-muted-foreground mt-1">Listings using Seller Launch Promotion are reserved for Buyer Early Access members for the first 48 hours. After that, they become visible to the general public.</p>
          </div>
          <div>
            <h4 className="font-semibold text-lg text-foreground">What is "Secure Contact Info Reveal"?</h4>
            <p className="text-muted-foreground mt-1">Seller contact information is hidden behind a reveal action to reduce casual scraping. Public listings can be contacted directly, while listings in their 48-hour early-access window require Buyer Early Access.</p>
          </div>
          <div>
            <h4 className="font-semibold text-lg text-foreground">Do you charge commissions on sales?</h4>
            <p className="text-muted-foreground mt-1">No. AeroTrade is an open marketplace directory, not a broker. Sellers can publish free listings or choose the separate 5 EUR one-time Seller Launch Promotion, but we never take a percentage of an equipment sale.</p>
          </div>
          <div>
            <h4 className="font-semibold text-lg text-foreground">How do I cancel my subscription?</h4>
            <p className="text-muted-foreground mt-1">You can cancel your subscription at any time directly from your Pilot Dashboard. Buyer Early Access remains active until the end of the current billing period, and you will not be charged again.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
