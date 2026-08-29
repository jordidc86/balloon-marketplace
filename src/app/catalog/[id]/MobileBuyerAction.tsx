'use client'

import { useEffect, useState } from 'react'
import BuyerIntentLink from './BuyerIntentLink'

export default function MobileBuyerAction({ listingId }: { listingId: string }) {
  const [formVisible, setFormVisible] = useState(false)

  useEffect(() => {
    const form = document.getElementById('buyer-enquiry')
    if (!form || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setFormVisible(entry.isIntersecting), { threshold: 0.15 })
    observer.observe(form)
    return () => observer.disconnect()
  }, [])

  if (formVisible) return null

  return (
    <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-40 grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border bg-background/95 p-3 shadow-2xl backdrop-blur sm:hidden" role="region" aria-label="Buyer enquiry shortcut">
      <div><p className="text-sm font-bold">Interested in this listing?</p><p className="text-xs text-muted-foreground">Ask securely · no account required</p></div>
      <BuyerIntentLink listingId={listingId} href="#buyer-enquiry" primary>Ask seller</BuyerIntentLink>
    </div>
  )
}
