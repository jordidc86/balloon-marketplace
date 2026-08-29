import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BadgeEuro, Camera, Globe2, ShieldCheck } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Sell a Hot Air Balloon in Europe | AeroTrade',
  description: 'Sell your hot air balloon, envelope, basket or burner to European and international buyers. Publish free or ask AeroTrade to help prepare the listing.',
  alternates: { canonical: '/sell-hot-air-balloon' },
  openGraph: {
    type: 'website',
    siteName: 'AeroTrade',
    title: 'Sell a Hot Air Balloon in Europe | AeroTrade',
    description: 'Reach serious balloon buyers with a free listing, or record a private assisted-sale request if the listing is not ready.',
    url: '/sell-hot-air-balloon',
  },
}

const fullListingHref = '/sell?source=seller_seo'
const assistedHref = '/sell/assisted?source=seller_seo'

export default function SellHotAirBalloonPage() {
  return (
    <main>
      <section className="border-b bg-background">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-primary">European balloon marketplace</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">Sell your hot air balloon without losing the opportunity to an unfinished advert.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">Reach buyers looking for complete balloons, envelopes, baskets, burners, bottom ends and cylinders. Publish a normal listing for free, choose the optional 5 EUR one-time Seller Launch Promotion, or ask AeroTrade to help prepare the information privately.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={fullListingHref} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground">Create a free listing <ArrowRight className="h-4 w-4" /></Link>
              <Link href={assistedHref} className="inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 font-bold">Get help preparing the sale</Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">AeroTrade does not publish assisted-sale details until you complete and approve the normal listing.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border bg-card p-5"><Globe2 className="h-6 w-6 text-primary" /><h2 className="mt-4 font-bold">International reach</h2><p className="mt-1 text-sm text-muted-foreground">One structured advert for buyers across borders.</p></article>
            <article className="rounded-2xl border bg-card p-5"><BadgeEuro className="h-6 w-6 text-primary" /><h2 className="mt-4 font-bold">Transparent entry</h2><p className="mt-1 text-sm text-muted-foreground">Public listing free; Seller Launch Promotion is optional and costs 5 EUR once per listing.</p></article>
            <article className="rounded-2xl border bg-card p-5"><Camera className="h-6 w-6 text-primary" /><h2 className="mt-4 font-bold">Not ready yet?</h2><p className="mt-1 text-sm text-muted-foreground">Record what exists now and identify missing photos, documents or price.</p></article>
            <article className="rounded-2xl border bg-card p-5"><ShieldCheck className="h-6 w-6 text-primary" /><h2 className="mt-4 font-bold">Owner-controlled</h2><p className="mt-1 text-sm text-muted-foreground">You approve the advert and remain responsible for the transaction.</p></article>
          </div>
        </div>
      </section>

      <section className="bg-secondary/30 py-14">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-3xl font-extrabold">What should be ready?</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-background p-5"><p className="font-bold">Aircraft identity</p><p className="mt-2 text-sm text-muted-foreground">Manufacturer, model or volume, year, registration and serial where applicable.</p></div>
            <div className="rounded-xl border bg-background p-5"><p className="font-bold">Condition and evidence</p><p className="mt-2 text-sm text-muted-foreground">Accurate condition, inspection context, available documentation and material defects.</p></div>
            <div className="rounded-xl border bg-background p-5"><p className="font-bold">Photos and contact</p><p className="mt-2 text-sm text-muted-foreground">At least one working image, location, expected price or enquiry basis, and buyer contact details.</p></div>
          </div>
          <div className="mt-8 rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div><p className="text-xl font-bold">Do not have everything?</p><p className="mt-1 text-sm text-muted-foreground">Use the private assisted path. It creates a commercial case, not a public or incomplete advert.</p></div>
            <Link href={assistedHref} className="mt-4 inline-flex shrink-0 items-center gap-2 rounded-lg bg-foreground px-5 py-3 text-sm font-bold text-background sm:mt-0">Start with what I know <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </main>
  )
}
