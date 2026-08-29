import { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Brush, Calculator, Factory, Send } from 'lucide-react'
import { siteUrl, supportEmail } from '@/utils/site'
import { normalizeNewBalloonLeadSource } from '@/utils/new-balloon-lead.mjs'
import { buildNewBalloonServiceJsonLd, serializeJsonLd } from '@/utils/marketplace-seo.mjs'
import { submitNewBalloonQuote } from './actions'

export const metadata: Metadata = {
  title: 'New Balloon Quote | AeroTrade Marketplace',
  description: 'Buy a new Pasha or Schroeder hot air balloon through AeroTrade and request an indicative budget and visual concept.',
  alternates: { canonical: '/new-balloon' },
  openGraph: {
    type: 'website',
    siteName: 'AeroTrade',
    title: 'Buy a New Pasha or Schroeder Balloon | AeroTrade',
    description: 'Request an indicative budget and configuration guidance for a factory-new Pasha or Schroeder hot air balloon.',
    url: '/new-balloon',
  },
  twitter: {
    card: 'summary',
    title: 'Buy a New Pasha or Schroeder Balloon | AeroTrade',
    description: 'Request an indicative budget and configuration guidance for a factory-new Pasha or Schroeder hot air balloon.',
  },
}

export default async function NewBalloonPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const success = params.success === 'true'
  const error = typeof params.error === 'string' ? params.error : null
  const sourceContext = normalizeNewBalloonLeadSource(typeof params.source === 'string' ? params.source : 'direct')

  return (
    <div className="bg-secondary/40">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(buildNewBalloonServiceJsonLd(siteUrl)) }}
      />
      <section className="border-b bg-background">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8 lg:py-16">
          <div className="flex flex-col justify-center">
            <Link href="/catalog" className="mb-6 inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
              Marketplace <ArrowRight className="h-4 w-4" />
            </Link>
            <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">
              Buy a new balloon through AeroTrade.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              AeroTrade does not only sell used equipment. If the current marketplace does not contain the right aircraft, we can source a factory-new Pasha or Schroeder balloon and prepare an indicative budget for your configuration.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <div className="border bg-card p-4">
                <Factory className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm font-bold">Pasha or Schroeder</p>
                <p className="mt-1 text-xs text-muted-foreground">Choose one, or tell us you want advice.</p>
              </div>
              <div className="border bg-card p-4">
                <Brush className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm font-bold">Quick visual idea</p>
                <p className="mt-1 text-xs text-muted-foreground">Share colours, logo or a rough style.</p>
              </div>
              <div className="border bg-card p-4 sm:col-span-2">
                <Calculator className="mb-3 h-5 w-5 text-primary" />
                <p className="text-sm font-bold">Indicative budget before commitment</p>
                <p className="mt-1 text-xs text-muted-foreground">We first clarify size, intended use and equipment. The initial figure is guidance, not a binding factory quotation.</p>
              </div>
            </div>
            <p className="mt-6 text-sm text-muted-foreground">Prefer a direct conversation? <a className="font-semibold text-primary underline" href={`mailto:${supportEmail}?subject=New%20balloon%20enquiry`}>Contact AeroTrade</a>.</p>
          </div>

          <div className="border bg-card p-6 shadow-sm sm:p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">Request an indicative budget</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tell us enough to recommend Pasha or Schroeder, outline a suitable configuration and prepare a first price direction.
              </p>
            </div>

            {success && (
              <div className="mb-6 border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-700">
                Request received. We will review it and come back with next steps.
              </div>
            )}

            {error && (
              <div className="mb-6 border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive">
                {error}
              </div>
            )}

            <form action={submitNewBalloonQuote} className="space-y-5">
              <input type="hidden" name="source_context" value={sourceContext} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium">
                  Name *
                  <input name="name" required className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary" />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Email *
                  <input name="email" type="email" required className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary" />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Phone
                  <input name="phone" type="tel" className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary" />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Country
                  <input name="country" className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary" />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium">
                  Manufacturer preference
                  <select name="manufacturer_preference" defaultValue="advice" className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary">
                    <option value="advice">Advise me</option>
                    <option value="pasha">Pasha</option>
                    <option value="schroeder">Schroeder</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Equipment type *
                  <select name="equipment_type" required defaultValue="" className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary">
                    <option value="" disabled>Select one...</option>
                    <option value="complete-balloon">Complete balloon</option>
                    <option value="envelope-only">Envelope only</option>
                    <option value="basket">Basket</option>
                    <option value="burner">Burner</option>
                    <option value="bottom-end">Bottom end</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Volume / capacity
                  <input name="volume_or_capacity" placeholder="e.g. 105,000 cu ft / 4 passengers" className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary" />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Intended use
                  <select name="intended_use" defaultValue="private" className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary">
                    <option value="private">Private flying</option>
                    <option value="commercial-rides">Commercial rides</option>
                    <option value="advertising">Advertising / branded balloon</option>
                    <option value="competition">Competition</option>
                    <option value="training">Training</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Budget range
                  <select name="budget_range" defaultValue="not-specified" className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary">
                    <option value="not-specified">Not specified</option>
                    <option value="under-50k">Under 50k EUR</option>
                    <option value="50k-100k">50k-100k EUR</option>
                    <option value="100k-150k">100k-150k EUR</option>
                    <option value="150k-plus">150k+ EUR</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Timeline
                  <select name="timeline" defaultValue="exploring" className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary">
                    <option value="exploring">Just exploring</option>
                    <option value="0-3-months">0-3 months</option>
                    <option value="3-6-months">3-6 months</option>
                    <option value="6-12-months">6-12 months</option>
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5 text-sm font-medium">
                Colours, branding or artwork idea
                <textarea name="colors_or_branding" rows={3} placeholder="Colours, sponsor/logo idea, style references..." className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary" />
              </label>

              <label className="block space-y-1.5 text-sm font-medium">
                Notes
                <textarea name="notes" rows={4} placeholder="Anything else we should know?" className="w-full border bg-input/50 px-3 py-2 outline-none focus:ring-2 focus:ring-primary" />
              </label>

              <button className="inline-flex w-full items-center justify-center gap-2 bg-primary px-5 py-3 font-bold text-primary-foreground hover:bg-primary/90">
                <Send className="h-4 w-4" />
                Request Indicative Budget & Visual Concept
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  )
}
