'use client'

import { useEffect } from 'react'
import { logListingView } from './actions'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'

const storageKey = (listingId: string) => `aerotrade:view:${listingId}`

export default function ListingViewTracker({ listingId }: { listingId: string }) {
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(storageKey(listingId))) return
      window.sessionStorage.setItem(storageKey(listingId), 'pending')
      void logListingView(listingId, getBrowserCommercialContext())
        .then((recorded) => {
          if (recorded) {
            window.sessionStorage.setItem(storageKey(listingId), 'recorded')
          } else {
            window.sessionStorage.removeItem(storageKey(listingId))
          }
        })
        .catch(() => window.sessionStorage.removeItem(storageKey(listingId)))
    } catch {
      // Analytics must never block or degrade the listing experience.
    }
  }, [listingId])

  return null
}
