import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, ClipboardCheck, ImagePlus, ListChecks } from 'lucide-react'
import { createClient } from '@/utils/supabase/server'
import SellerAssistanceForm from './SellerAssistanceForm'

export const metadata: Metadata = {
  title: 'Assisted Balloon Sale | AeroTrade Marketplace',
  description: 'Ask AeroTrade to help prepare your used hot air balloon equipment for a normal marketplace listing.',
  alternates: { canonical: '/sell/assisted' },
}

export default async function AssistedSalePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="bg-secondary/30">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8 lg:py-16">
        <section className="flex flex-col justify-center">
          <Link href="/sell" className="mb-6 inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary">Create the full listing yourself <ArrowRight className="h-4 w-4" /></Link>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Want to sell, but not ready to list?</h1>
          <p className="mt-5 text-lg leading-8 text-muted-foreground">Do not abandon the sale because the photos, documents, description or price are not ready. Record the opportunity privately and AeroTrade can help you prepare the same normal marketplace listing.</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border bg-card p-4"><ListChecks className="mb-3 h-5 w-5 text-primary" /><p className="font-bold">Short intake</p><p className="mt-1 text-sm text-muted-foreground">Only the information you already know.</p></div>
            <div className="rounded-xl border bg-card p-4"><ImagePlus className="mb-3 h-5 w-5 text-primary" /><p className="font-bold">Preparation help</p><p className="mt-1 text-sm text-muted-foreground">Identify missing photos and listing information.</p></div>
            <div className="rounded-xl border bg-card p-4"><ClipboardCheck className="mb-3 h-5 w-5 text-primary" /><p className="font-bold">Owner approval</p><p className="mt-1 text-sm text-muted-foreground">Nothing becomes public until the normal listing is completed.</p></div>
          </div>
        </section>
        <SellerAssistanceForm defaultEmail={user?.email || ''} />
      </div>
    </main>
  )
}

