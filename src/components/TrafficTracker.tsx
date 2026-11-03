'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'
import { trafficPath } from '@/utils/traffic.mjs'
export default function TrafficTracker() {
  const pathname = usePathname()
  useEffect(() => {
    if (!trafficPath(pathname) || navigator.doNotTrack === '1' || (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl || navigator.webdriver) return
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== 'visible') return
      try {
        const key = `aerotrade:traffic:${pathname}`
        if (Date.now() - Number(sessionStorage.getItem(key) || 0) < 10000) return
        const context = getBrowserCommercialContext()
        if (!context.visitorId) return
        sessionStorage.setItem(key, String(Date.now()))
        void fetch('/api/traffic', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: crypto.randomUUID(), path: pathname, context }), keepalive: true }).catch(() => {})
      } catch { /* Measurement must not interrupt browsing. */ }
    }, 800)
    return () => clearTimeout(timer)
  }, [pathname])
  return null
}
