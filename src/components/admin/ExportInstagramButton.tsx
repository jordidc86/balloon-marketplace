'use client'

import React, { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Instagram, Loader2 } from 'lucide-react'
import {
  formatSocialCardPrice,
  getSocialCardFacts,
} from '@/utils/social-card'

// Minimal interface covering the properties we need.
interface ListingForExport {
  id: string
  title: string
  price: number
  currency: string
  details?: {
    hours?: string | number
  }
  condition?: string
  images?: { url: string; is_primary?: boolean | null }[]
}

const waitForDomImage = (image: HTMLImageElement, src: string) =>
  new Promise<void>((resolve) => {
    const finish = () => resolve()

    image.onload = finish
    image.onerror = finish
    image.src = src

    if (image.complete && image.naturalWidth > 0) {
      resolve()
    }
  })

const imageUrlToDataUrl = async (url: string) => {
  const response = await fetch(url, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`Image fetch failed with ${response.status}`)
  }

  const blob = await response.blob()

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read image data'))
    reader.readAsDataURL(blob)
  })
}

const addCacheBuster = (url: string) => {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${Date.now()}`
}

const getExportImageUrl = (url: string, listingId: string) => {
  if (!url.startsWith('http')) {
    return url
  }

  return `/api/image-proxy?listing=${encodeURIComponent(listingId)}&url=${encodeURIComponent(url)}`
}

const trimTitleForCard = (title: string) => {
  const cleanTitle = title.replace(/\s+/g, ' ').trim()

  return cleanTitle.length > 46 ? `${cleanTitle.slice(0, 43).trim()}...` : cleanTitle
}

export default function ExportInstagramButton({ listing }: { listing: ListingForExport }) {
  const [isExporting, setIsExporting] = useState(false)
  const nodeRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const handleExport = async () => {
    if (!nodeRef.current || !imageRef.current || !exportImage) return
    setIsExporting(true)
    
    try {
      const freshExportImage = addCacheBuster(exportImage)
      const imageDataUrl = await imageUrlToDataUrl(freshExportImage)
      await waitForDomImage(imageRef.current, imageDataUrl)
      
      const dataUrl = await toPng(nodeRef.current, {
        cacheBust: false,
        width: 1080,
        height: 1080,
        pixelRatio: 1,
        canvasWidth: 1080,
        canvasHeight: 1080,
        style: {
          width: '1080px',
          height: '1080px',
          transform: 'none',
        },
      })
      
      const link = document.createElement('a')
      link.download = `aerotrade-promo-${listing.id.substring(0, 8)}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Failed to generate image', err)
      alert("Failed to generate Instagram image. Check console.")
    } finally {
      setIsExporting(false)
    }
  }

  const primaryImage = listing.images?.find((image) => image.is_primary)
  const bgImage = primaryImage?.url || listing.images?.[0]?.url
  const exportImage = bgImage ? getExportImageUrl(bgImage, listing.id) : null
  const facts = getSocialCardFacts(listing)
  const displayHours = facts.hours || null
  const displayCondition = facts.condition

  return (
    <>
      <button 
        onClick={handleExport}
        disabled={isExporting || !exportImage}
        className="p-2 bg-pink-500/10 text-pink-600 hover:bg-pink-500/20 rounded-lg transition-colors flex items-center gap-1.5 font-semibold text-xs disabled:opacity-50" 
        title={exportImage ? 'Export AeroTrade social card (1080x1080)' : 'No cover image found for this listing'}
      >
        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Instagram className="w-4 h-4" />}
      </button>

      {/* Off-screen 1080x1080 Template */}
      <div 
        className="fixed top-0 -left-[2000px] pointer-events-none overflow-hidden" 
        style={{ width: '1080px', height: '1080px' }}
        aria-hidden="true"
      >
          <div 
          ref={nodeRef} 
          className="relative w-[1080px] h-[1080px] bg-slate-900 overflow-hidden font-sans"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={exportImage || ''}
            alt=""
            crossOrigin="anonymous"
            className="absolute inset-0 z-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 z-0 bg-black/35" />
          <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/35 via-slate-950/10 to-slate-950/70" />

          {/* Glass panels container */}
          <div className="absolute inset-12 z-10 border-[3px] border-white/20 rounded-[40px] overflow-hidden">
            
            {/* Top Left Badge */}
            <div className="absolute top-16 left-16 bg-white/95 rounded-2xl px-10 py-5 flex items-center gap-4 shadow-2xl">
               <div className="w-12 h-12 bg-slate-900 rounded-full flex items-center justify-center">
                  {/* Balloon icon fake */}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13c0 5.523-4.477 10-10 10S2 18.523 2 13C2 7.477 6.477 3 12 3s10 4.477 10 10z"></path><path d="M12 2v22"></path><path d="M17 5.5l-10 13"></path><path d="M7 5.5l10 13"></path></svg>
               </div>
               <div>
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900 leading-none mb-1">AEROTRADE</h2>
                  <p className="text-lg text-slate-600 font-medium leading-none">Balloon Marketplace</p>
               </div>
            </div>

            {/* Bottom Glass Panel */}
            <div className="absolute left-16 right-16 bottom-24 bg-slate-900/70 border border-white/30 rounded-[32px] p-12 shadow-[0_30px_60px_rgba(0,0,0,0.3)]">
              <div className="inline-block bg-white text-slate-900 px-6 py-2 rounded-full font-bold text-2xl mb-8 tracking-widest uppercase">
                FOR SALE
              </div>
              
              <h1
                className="text-white font-extrabold leading-[1.04] mb-7 overflow-hidden"
                style={{ fontSize: '64px', maxHeight: '134px' }}
              >
                {trimTitleForCard(listing.title)}
              </h1>

              <div className="text-white font-black mb-10 drop-shadow-lg leading-none" style={{ fontSize: '64px' }}>
                {formatSocialCardPrice(listing)}
              </div>

              <div className="flex flex-col gap-4 text-white text-3xl font-medium">
                {displayHours && (
                  <div className="flex items-center gap-4">
                     <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>
                     {displayHours}
                  </div>
                )}
                <div className="flex items-center gap-4">
                   <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                   Condition: {displayCondition}
                </div>
              </div>

            </div>

             {/* Bottom Handle */}
             <div className="absolute bottom-8 right-16 text-white/95 text-4xl font-semibold tracking-wide drop-shadow-md">
                aerotrade.app
             </div>
          </div>
        </div>
      </div>
    </>
  )
}
