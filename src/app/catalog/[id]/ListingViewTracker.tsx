'use client'

import { useEffect } from 'react'
import { logListingView, logSoldListingView } from './actions'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'

const storageKey = (listingId: string, sold: boolean) => `aerotrade:${sold ? 'sold-view' : 'view'}:${listingId}`

export default function ListingViewTracker({ listingId, sold = false }: { listingId: string; sold?: boolean }) {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(storageKey(listingId, sold))) return
      window.sessionStorage.setItem(storageKey(listingId, sold), 'pending')
      const recordView = sold ? logSoldListingView : logListingView
      void recordView(listingId, getBrowserCommercialContext())
        .then((recorded) => {
          if (recorded) {
            window.sessionStorage.setItem(storageKey(listingId, sold), 'recorded')
          } else {
            window.sessionStorage.removeItem(storageKey(listingId, sold))
          }
        })
        .catch(() => window.sessionStorage.removeItem(storageKey(listingId, sold)))
    } catch {
      // Analytics must never block or degrade the listing experience.
    }
  }, [listingId, sold])

  return null
}
