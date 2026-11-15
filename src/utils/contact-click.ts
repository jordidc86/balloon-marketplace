import { getBrowserCommercialContext } from '@/utils/browser-attribution'
export function recordContactClick(listingId: string, channel: 'email' | 'phone' | 'whatsapp') {
  try {
    if (navigator.doNotTrack === '1' || navigator.webdriver || (navigator as Navigator & {globalPrivacyControl?: boolean}).globalPrivacyControl) return
    const context = getBrowserCommercialContext()
    if (!context.visitorId) return
    void fetch('/api/traffic', {method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({eventId:crypto.randomUUID(),path:`/catalog/${listingId}`,channel,context})}).catch(()=>{})
  } catch { /* Contact navigation must work even when measurement fails. */ }
}
