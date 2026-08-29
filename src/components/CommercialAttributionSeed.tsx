'use client'

import { useEffect } from 'react'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'

export default function CommercialAttributionSeed() {
  useEffect(() => {
    // Preserve the first external source for the existing catalog, enquiry,
    // wanted-request and new-balloon funnels. This creates no analytics event.
    getBrowserCommercialContext()
  }, [])

  return null
}
