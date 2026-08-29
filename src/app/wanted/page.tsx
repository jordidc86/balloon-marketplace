import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BellRing, SearchCheck } from 'lucide-react'
import { listingCategories } from '@/utils/listing-submission.mjs'
import WantedRequestForm from './WantedRequestForm'

export const metadata: Metadata = {
  title: 'Wanted Equipment | AeroTrade Marketplace',
  description: 'Record the hot air balloon equipment you need and let AeroTrade identify relevant current or future supply.',
  alternates: { canonical: '/wanted' },
}

export default async function WantedPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const params = await searchParams
  const initialCategory = typeof params.category === 'string' && listingCategories.includes(params.category) ? params.category : ''
  return (
    <main className="bg-secondary/30">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8 lg:py-16">
        <section className="flex flex-col justify-center">
          <Link href="/catalog" className="mb-6 inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary">Browse marketplace <ArrowRight className="h-4 w-4" /></Link>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Cannot find the right equipment?</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">Turn a missing search result into a tracked buying requirement. AeroTrade can compare it with current inventory and retain your permission to alert you about a suitable match.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-4"><SearchCheck className="mb-3 h-5 w-5 text-primary" /><p className="font-bold">Demand meets supply</p><p className="mt-1 text-sm text-muted-foreground">Category, currency and budget are compared with active listings.</p></div>
            <div className="rounded-xl border bg-card p-4"><BellRing className="mb-3 h-5 w-5 text-primary" /><p className="font-bold">Explicit match alerts</p><p className="mt-1 text-sm text-muted-foreground">You choose whether AeroTrade may email when relevant equipment appears.</p></div>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">Looking for a factory-new aircraft? <Link href="/new-balloon" className="font-semibold text-primary underline">Request a new balloon quote instead.</Link></p>
        </section>
        <WantedRequestForm initialCategory={initialCategory} />
      </div>
    </main>
  )
}
