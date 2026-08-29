import Link from 'next/link'
import { ArrowRight, Calculator, ClipboardCheck, Factory, ShieldCheck } from 'lucide-react'

type Manufacturer = {
  slug: string
  name: string
  shortName: string
  path: string
  headline: string
  description: string
}

export default function NewBalloonManufacturerLanding({ manufacturer }: { manufacturer: Manufacturer }) {
  // Internal links must not overwrite the visitor's real external acquisition campaign.
  const requestHref = `/new-balloon?manufacturer=${manufacturer.slug}&source=navigation`

  return (
    <div className="bg-secondary/40">
      <section className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-18">
          <Link href="/new-balloon" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80">
            New balloon service <ArrowRight className="h-4 w-4" />
          </Link>
          <div className="mt-8 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">{manufacturer.name}</p>
              <h1 className="mt-3 max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">{manufacturer.headline}</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{manufacturer.description}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href={requestHref} className="inline-flex items-center justify-center gap-2 bg-primary px-5 py-3 font-bold text-primary-foreground hover:bg-primary/90">
                  Request a {manufacturer.shortName} budget <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/catalog" className="inline-flex items-center justify-center border bg-background px-5 py-3 font-bold hover:bg-muted">
                  Compare used equipment
                </Link>
              </div>
            </div>

            <div className="border bg-card p-6 shadow-sm sm:p-8">
              <Factory className="h-7 w-7 text-primary" />
              <h2 className="mt-4 text-2xl font-bold">Start with the mission, not a guessed price.</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                A useful first budget depends on capacity, equipment scope, operating country, intended use and artwork. AeroTrade collects those inputs before preparing any indicative range.
              </p>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                Any initial range is non-binding. Final specification, availability, delivery, taxes, transport, contract and payment terms must be confirmed before an order.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold tracking-tight">One practical path from idea to proposal</h2>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          <div className="border bg-card p-5">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            <h3 className="mt-4 font-bold">1. Define the requirement</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Capacity, private or commercial use, operating country, equipment scope and target timing.</p>
          </div>
          <div className="border bg-card p-5">
            <Calculator className="h-6 w-6 text-primary" />
            <h3 className="mt-4 font-bold">2. Receive an indicative direction</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">AeroTrade prepares a bounded configuration and price range instead of publishing an unreliable generic figure.</p>
          </div>
          <div className="border bg-card p-5">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h3 className="mt-4 font-bold">3. Confirm before commitment</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">The exact scope and commercial conditions are checked before any binding factory order or payment.</p>
          </div>
        </div>
        <div className="mt-8 border border-primary/20 bg-primary/5 p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <h2 className="text-xl font-bold">No suitable used balloon in the marketplace?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Keep the used-market option open while AeroTrade prepares the new {manufacturer.shortName} alternative.</p>
          </div>
          <Link href={requestHref} className="mt-4 inline-flex shrink-0 items-center gap-2 font-bold text-primary underline sm:mt-0">
            Start the request <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  )
}
