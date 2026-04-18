'use client'

import React, { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import { Instagram, Loader2 } from 'lucide-react'

// Minimal interface covering the properties we need.
interface ListingForExport {
  id: string
  title: string
  price: number
  currency: string
  details?: any
  condition?: string
  images?: { url: string }[]
}

export default function ExportInstagramButton({ listing }: { listing: ListingForExport }) {
  const [isExporting, setIsExporting] = useState(false)
  const nodeRef = useRef<HTMLDivElement>(null)

  const handleExport = async () => {
    if (!nodeRef.current) return
    setIsExporting(true)
    
    try {
      // Small timeout to ensure fonts/images block is parsed
      await new Promise(res => setTimeout(res, 300))
      
      const dataUrl = await toPng(nodeRef.current, {
        cacheBust: true,
        width: 1080,
        height: 1080,
        pixelRatio: 1, // Standard for 1080px export
        style: {
          display: 'flex', // override the hidden display during render
        }
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

  const bgImage = listing.images && listing.images.length > 0 
    ? listing.images[0].url 
    : 'https://images.unsplash.com/photo-1543326727-cf6c39e8f84c?q=80&w=2000&auto=format&fit=crop'
  
  const displayHours = listing.details?.hours || 'N/A'
  const displayCondition = listing.condition || 'Used'

  return (
    <>
      <button 
        onClick={handleExport}
        disabled={isExporting}
        className="p-2 bg-pink-500/10 text-pink-600 hover:bg-pink-500/20 rounded-lg transition-colors flex items-center gap-1.5 font-semibold text-xs disabled:opacity-50" 
        title="Export for Instagram (1080x1080)"
      >
        {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Instagram className="w-4 h-4" />}
      </button>

      {/* Hidden 1080x1080 Template */}
      <div 
        className="fixed top-0 left-0 pointer-events-none -z-50 opacity-0 overflow-hidden" 
        style={{ width: '1080px', height: '1080px' }}
      >
        <div 
          ref={nodeRef} 
          className="relative w-[1080px] h-[1080px] bg-slate-900 flex flex-col items-center justify-center p-12 overflow-hidden font-sans"
          style={{ display: 'none' }} // to-png forces style display block overrides via opts
        >
          {/* Background Image with slight dark overlay */}
          <div 
            className="absolute inset-0 z-0 bg-cover bg-center"
            style={{ 
              backgroundImage: `url(${bgImage})`,
            }}
          />
          <div className="absolute inset-0 z-0 bg-black/30" />

          {/* Glass panels container */}
          <div className="relative z-10 w-full h-full border-[3px] border-white/20 rounded-[40px] flex flex-col items-start justify-end p-16">
            
            {/* Top Left Badge */}
            <div className="absolute top-16 left-16 bg-white/90 backdrop-blur-md rounded-2xl px-10 py-5 flex items-center gap-4 shadow-2xl">
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
            <div className="w-[85%] bg-white/10 backdrop-blur-2xl border border-white/30 rounded-[32px] p-12 shadow-[0_30px_60px_rgba(0,0,0,0.3)]">
              <div className="inline-block bg-white text-slate-900 px-6 py-2 rounded-full font-bold text-2xl mb-8 tracking-widest uppercase">
                FOR SALE
              </div>
              
              <h1 className="text-white font-extrabold leading-[1.1] mb-6" style={{ fontSize: '72px' }}>
                {listing.title.substring(0, 50)}{listing.title.length > 50 ? '...' : ''}
              </h1>

              <div className="text-white font-black text-7xl mb-10 drop-shadow-lg">
                {listing.price.toLocaleString()} {listing.currency}
              </div>

              <div className="flex flex-col gap-4 text-white text-3xl font-medium">
                <div className="flex items-center gap-4">
                   <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg></div>
                   {displayHours}
                </div>
                <div className="flex items-center gap-4">
                   <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
                   Condition: {displayCondition}
                </div>
              </div>

            </div>

             {/* Bottom Handle */}
             <div className="absolute bottom-[-10px] right-16 text-white/90 text-4xl font-semibold tracking-wide drop-shadow-md">
                @balloonconsulting
             </div>
          </div>
        </div>
      </div>
    </>
  )
}
