'use client'

import { useEffect, useRef } from 'react'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'

export default function CommercialAttributionFields() {
  const visitorId = useRef<HTMLInputElement>(null)
  const referrer = useRef<HTMLInputElement>(null)
  const utmSource = useRef<HTMLInputElement>(null)
  const utmMedium = useRef<HTMLInputElement>(null)
  const utmCampaign = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const context = getBrowserCommercialContext()
    if (visitorId.current) visitorId.current.value = context.visitorId || ''
    if (referrer.current) referrer.current.value = context.referrer
    if (utmSource.current) utmSource.current.value = context.utmSource || ''
    if (utmMedium.current) utmMedium.current.value = context.utmMedium || ''
    if (utmCampaign.current) utmCampaign.current.value = context.utmCampaign || ''
  }, [])

  return (
    <>
      <input ref={visitorId} type="hidden" name="attribution_visitor_id" defaultValue="" />
      <input ref={referrer} type="hidden" name="attribution_referrer" defaultValue="" />
      <input ref={utmSource} type="hidden" name="attribution_utm_source" defaultValue="" />
      <input ref={utmMedium} type="hidden" name="attribution_utm_medium" defaultValue="" />
      <input ref={utmCampaign} type="hidden" name="attribution_utm_campaign" defaultValue="" />
    </>
  )
}
