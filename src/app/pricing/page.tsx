import { createClient } from '@/utils/supabase/server'
import { Check, Plane, Lock, Star } from 'lucide-react'
import { createPremiumCheckout } from './actions'
import { redirect } from 'next/navigation'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'AeroTrade Premium | AeroTrade Marketplace',
  description: 'Get new listing alerts, saved-search matches and early access to promoted AeroTrade listings for 9.99 EUR per year.',
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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
      <div className="text-center mb-10 md:mb-16">
        <p className="mb-3 text-sm font-bold uppercase tracking-wider text-primary">Annual buyer membership</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Find the right equipment. Hear about it sooner.</h1>
        <p className="text-xl text-muted-foreground text-balance max-w-2xl mx-auto">
          Get new AeroTrade listing alerts, daily matches for your saved searches across the marketplaces we review, and a 48-hour head start on promoted AeroTrade listings.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        
        {/* Free Tier */}
        <div className="order-2 border bg-card rounded-3xl p-8 h-full md:order-1">
          <h2 className="text-2xl font-bold mb-2 text-foreground">Basic Access</h2>
          <div className="text-4xl font-black mb-6">€ 0 <span className="text-lg text-muted-foreground font-medium">/ forever</span></div>
          
          <ul className="space-y-4 mb-8 text-muted-foreground">
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-foreground" /> <span>Browse public listings</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-foreground" /> <span>Publish free listings</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-foreground" /> <span>Optional 5 EUR one-time Seller Launch Promotion</span></li>
            <li className="flex items-start gap-3 opacity-50"><Lock className="w-5 h-5 shrink-0" /> <span>No access during the 48-hour buyer window</span></li>
            <li className="flex items-start gap-3 opacity-50"><Lock className="w-5 h-5 shrink-0" /> <span>No Premium listing or saved-search alerts</span></li>
          </ul>

          <div className="mt-8 p-4 bg-muted/40 rounded-xl text-sm border font-medium text-center">
             Included by default
          </div>
        </div>

        {/* Premium Tier */}
        <div className="order-1 md:order-2 border-2 border-primary bg-primary/5 rounded-3xl p-8 relative shadow-lg transform md:-translate-y-4">
          <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-sm font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
            <Star className="w-4 h-4" /> Recommended
          </div>
          <h2 className="text-2xl font-bold mb-2 text-foreground">AeroTrade Premium</h2>
          <div className="text-5xl font-black mb-6 text-foreground">€ 9.99 <span className="text-lg text-muted-foreground font-medium">/ year</span></div>
          
          <ul className="space-y-4 mb-8 text-foreground font-medium">
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>48-hour early access to promoted AeroTrade listings</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>New listing alerts, including free and assisted AeroTrade listings</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>Up to five saved searches with daily alerts for new matches</span></li>
            <li className="flex items-start gap-3"><Check className="w-5 h-5 shrink-0 text-primary" /> <span>Manage alerts and your annual subscription from your dashboard</span></li>
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
                 AeroTrade Premium is active
              </button>
            ) : (
              <form action={createPremiumCheckout}>
                <button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-4 rounded-xl font-bold text-lg transition-all shadow-md hover:shadow-xl hover:-translate-y-1 flex items-center justify-center gap-2">
                  <Plane className="w-5 h-5" /> 
                  Get AeroTrade Premium
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
            <h4 className="font-semibold text-lg text-foreground">How do search alerts work?</h4><p className="text-muted-foreground mt-1">Save up to five searches from the catalogue. We email new matching results at most once a day per search. Existing results form your starting point and are not emailed when you subscribe. External marketplaces are reviewed daily; an advert we discover may already have been public on its original site.</p></div><div><h4 className="font-semibold text-lg text-foreground">How does the 48-Hour Early Access work?</h4>
            <p className="text-muted-foreground mt-1">Only AeroTrade listings using Seller Launch Promotion are reserved for AeroTrade Premium members for the first 48 hours. After that, they become visible to the general public. Free and assisted public listings stay public from the start; external adverts are never exclusive to AeroTrade.</p>
          </div>
          <div>
            <h4 className="font-semibold text-lg text-foreground">What is "Secure Contact Info Reveal"?</h4>
            <p className="text-muted-foreground mt-1">Seller contact information is hidden behind a reveal action to reduce casual scraping. Public listings can be contacted directly, while listings in their 48-hour early-access window require AeroTrade Premium.</p>
          </div>
          <div>
            <h4 className="font-semibold text-lg text-foreground">Do you charge commissions on sales?</h4>
            <p className="text-muted-foreground mt-1">No. AeroTrade is an open marketplace directory, not a broker. Sellers can publish free listings or choose the separate 5 EUR one-time Seller Launch Promotion, but we never take a percentage of an equipment sale.</p>
          </div>
          <div>
            <h4 className="font-semibold text-lg text-foreground">How do I cancel my subscription?</h4>
            <p className="text-muted-foreground mt-1">You can cancel your subscription at any time directly from your Pilot Dashboard. AeroTrade Premium remains active until the end of the current billing period, and you will not be charged again.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
