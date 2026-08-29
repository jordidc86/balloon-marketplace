import { createClient } from '@/utils/supabase/server'
import SellForm from '@/components/SellForm'
import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Handshake, LockKeyhole } from 'lucide-react'
import { normalizeSellerAcquisitionSource } from '@/utils/seller-acquisition.mjs'

export const metadata: Metadata = {
  title: 'Post a Listing | AeroTrade Marketplace',
  description: 'List your hot air balloon equipment on the global exchange and reach buyers worldwide.',
}

export default async function SellPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const sourceContext = normalizeSellerAcquisitionSource(params.source)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let isPremium = false
  if (user) {
    const { data: profile } = await supabase.from('users').select('is_premium').eq('id', user.id).single()
    isPremium = profile?.is_premium || false
  }

  const returnPath = `/sell?source=${encodeURIComponent(sourceContext)}`

  if (!user) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-primary">Sell through AeroTrade</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Start without losing your work.</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">A full public listing needs a free AeroTrade account so the aircraft, photos and buyer contact remain under your control. If you are not ready, record the opportunity privately without creating an account first.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <LockKeyhole className="h-7 w-7 text-primary" />
            <h2 className="mt-4 text-2xl font-bold">I am ready to list</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Create an account first, then return directly to the listing form. Nothing you enter will be discarded by a late login prompt.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link href={`/signup?redirectTo=${encodeURIComponent(returnPath)}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Create free account <ArrowRight className="h-4 w-4" /></Link>
              <Link href={`/login?redirectTo=${encodeURIComponent(returnPath)}`} className="inline-flex items-center justify-center rounded-lg border px-4 py-3 text-sm font-bold">Log in</Link>
            </div>
          </section>
          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-sm">
            <Handshake className="h-7 w-7 text-primary" />
            <h2 className="mt-4 text-2xl font-bold">I need help preparing it</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Tell AeroTrade what you may sell, even if the photos, documents, description or expected price are incomplete. The request remains private until you approve a normal listing.</p>
            <Link href={`/sell/assisted?source=${encodeURIComponent(sourceContext === 'direct' ? 'sell_gateway' : sourceContext)}`} className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-bold text-background">Record a private sale request <ArrowRight className="h-4 w-4" /></Link>
          </section>
        </div>
      </main>
    )
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
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold">Not ready with the photos, documents or price?</p><p className="mt-1 text-sm text-muted-foreground">Record a short private sale request and AeroTrade can help you prepare this same marketplace listing.</p></div>
          <Link href={`/sell/assisted?source=${encodeURIComponent(sourceContext === 'direct' ? 'sell_gateway' : sourceContext)}`} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><Handshake className="h-4 w-4" />Get help selling</Link>
        </div>
      </div>

      <SellForm userId={user.id} defaultContactEmail={user.email || null} sellerEntryContext={sourceContext} />
    </div>
  )
}
