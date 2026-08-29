'use client'

import type { ReactNode } from 'react'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'
import { logListingCommercialIntent } from './actions'

export default function BuyerIntentLink({ listingId, href, children, primary = false }: { listingId: string; href: string; children: ReactNode; primary?: boolean }) {
  const handleClick = () => {
    try {
      const key = `aerotrade:intent:${listingId}:ENQUIRY_CTA_CLICKED`
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, 'pending')
        void logListingCommercialIntent(listingId, 'ENQUIRY_CTA_CLICKED', getBrowserCommercialContext())
          .then((recorded) => recorded ? window.sessionStorage.setItem(key, 'recorded') : window.sessionStorage.removeItem(key))
          .catch(() => window.sessionStorage.removeItem(key))
      }
    } catch {
      // Measurement cannot interrupt navigation to the enquiry form.
    }
  }

  return <a href={href} onClick={handleClick} className={primary ? 'rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground hover:bg-primary/90' : 'rounded-xl border px-4 py-3 text-center text-sm font-semibold text-primary'}>{children}</a>
}
