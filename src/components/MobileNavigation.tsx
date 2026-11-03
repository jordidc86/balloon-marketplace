'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { Clock, Grid2X2, Menu, Plus, Search, Sparkles, X } from 'lucide-react'
import { signout } from '@/app/login/actions'

export default function MobileNavigation({ signedIn, isAdmin }: { signedIn: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); button.current?.focus() }
    }
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    const desktop = window.matchMedia('(min-width: 1024px)')
    const resize = () => { if (desktop.matches) setOpen(false) }
    document.addEventListener('keydown', escape)
    document.addEventListener('pointerdown', outside)
    desktop.addEventListener('change', resize)
    return () => {
      document.removeEventListener('keydown', escape)
      document.removeEventListener('pointerdown', outside)
      desktop.removeEventListener('change', resize)
    }
  }, [open])
  const links = [
    { href: '/catalog', title: 'Marketplace', detail: 'Used balloons and equipment', Icon: Grid2X2 },
    { href: '/wanted', title: 'Wanted', detail: 'Find the equipment you need', Icon: Search },
    { href: '/new-balloon?source=navigation', title: 'Buy New', detail: 'Explore options and request a quote', Icon: Sparkles },
    { href: '/pricing', title: 'Buyer Early Access', detail: 'Discover promoted listings earlier', Icon: Clock },
  ]
  return <div ref={root} className="lg:hidden">
    <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      {open ? <X aria-hidden="true" size={20} /> : <Menu aria-hidden="true" size={20} />}{open ? 'Close' : 'Menu'}
    </button>
    <div id={id} hidden={!open} className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b bg-background px-5 pb-6 pt-5 shadow-xl">
      <p className="mb-3 text-xs font-bold tracking-widest text-muted-foreground">EXPLORE AEROTRADE</p>
      {links.map(({ href, title, detail, Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} className="flex min-h-16 items-center gap-4 rounded-xl px-3 py-3 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary">
        <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary" /><span><span className="block font-semibold">{title}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></span>
      </Link>)}
      <div className="mt-4 space-y-3 border-t pt-5">
        <Link href="/sell?source=navigation" onClick={() => setOpen(false)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground"><Plus aria-hidden="true" size={18} />Sell Equipment</Link>
        <Link href={signedIn ? '/dashboard' : '/login'} onClick={() => setOpen(false)} className="block rounded-xl border px-4 py-3 text-center font-semibold">{signedIn ? 'My Account' : 'Log In'}</Link>
        {isAdmin ? <Link href="/admin" onClick={() => setOpen(false)} className="block rounded-lg px-4 py-3 text-center font-semibold">Administration</Link> : null}
        {signedIn ? <form action={signout}><button className="min-h-11 w-full rounded-lg px-4 py-2 text-muted-foreground">Log out</button></form> : null}
      </div>
    </div>
  </div>
}
