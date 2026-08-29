'use client'

import { useEffect } from 'react'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'
import { logCatalogSearch } from './actions'

type CatalogSearch = {
  query: string
  category: string | null
  country: string
  sort: string
  resultCount: number
}

export default function CatalogSearchTracker({ search }: { search: CatalogSearch }) {
  useEffect(() => {
    const storageKey = `aerotrade:catalog-search:${window.location.pathname}${window.location.search}`
    try {
      if (window.sessionStorage.getItem(storageKey)) return
      window.sessionStorage.setItem(storageKey, 'pending')
      void logCatalogSearch(search, getBrowserCommercialContext()).then((recorded) => {
        if (recorded) window.sessionStorage.setItem(storageKey, 'recorded')
        else window.sessionStorage.removeItem(storageKey)
      }).catch(() => window.sessionStorage.removeItem(storageKey))
    } catch {
      // Analytics cannot block catalog browsing.
    }
  }, [search])

  return null
}
