'use client'

import { useState } from 'react'
import { Copy, Mail, Share2 } from 'lucide-react'
import { buildListingShareText, buildListingShareUrl } from '@/utils/listing-share.mjs'
import { recordSellerListingShare } from '@/app/dashboard/share-actions'

type ListingShareProps = {
  baseUrl: string
  listingId: string
  title: string
  source?: 'listing_share' | 'seller_share'
  compact?: boolean
  trackSellerShare?: boolean
}

type ShareMedium = 'native' | 'whatsapp' | 'email' | 'copy' | 'linkedin' | 'facebook'

export default function ListingShare({ baseUrl, listingId, title, source = 'listing_share', compact = false, trackSellerShare = false }: ListingShareProps) {
  const [copied, setCopied] = useState(false)
  const text = buildListingShareText(title)
  const urlFor = (medium: ShareMedium) => buildListingShareUrl({ baseUrl, listingId, source, medium })
  const whatsappHref = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + urlFor('whatsapp'))
  const emailHref = 'mailto:?subject=' + encodeURIComponent('AeroTrade listing: ' + title) + '&body=' + encodeURIComponent(text + '\n\n' + urlFor('email'))
  const linkedinHref = 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(urlFor('linkedin'))
  const facebookHref = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(urlFor('facebook'))
  const record = (medium: ShareMedium) => {
    if (trackSellerShare && source === 'seller_share') void recordSellerListingShare(listingId, medium)
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(text + '\n\n' + urlFor('copy'))
      record('copy')
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const share = async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text, url: urlFor('native') })
        record('native')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copyLink()
  }

  if (compact) {
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <a href={whatsappHref} onClick={() => record('whatsapp')} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted">WhatsApp</a>
        <a href={linkedinHref} onClick={() => record('linkedin')} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted">LinkedIn</a>
        <a href={facebookHref} onClick={() => record('facebook')} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted">Facebook</a>
        <button type="button" onClick={share} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted"><Share2 className="h-3.5 w-3.5" />{copied ? 'Copied' : 'Share'}</button>
      </div>
    )
  }

  return (
    <section className="rounded-xl border bg-muted/20 p-4">
      <div className="flex items-start gap-3">
        <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div><p className="font-semibold">Share this listing with a buyer</p><p className="mt-1 text-xs text-muted-foreground">Shared links retain only the channel and listing campaign so AeroTrade can measure whether distribution creates genuine interest.</p></div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <a href={whatsappHref} onClick={() => record('whatsapp')} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25D366] px-3 py-2 text-center text-sm font-semibold text-white">WhatsApp</a>
        <a href={linkedinHref} onClick={() => record('linkedin')} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#0A66C2] px-3 py-2 text-center text-sm font-semibold text-white">LinkedIn</a>
        <a href={facebookHref} onClick={() => record('facebook')} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#1877F2] px-3 py-2 text-center text-sm font-semibold text-white">Facebook</a>
        <a href={emailHref} onClick={() => record('email')} className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-semibold"><Mail className="h-4 w-4" />Email</a>
        <button type="button" onClick={copyLink} className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-semibold"><Copy className="h-4 w-4" />{copied ? 'Message copied' : 'Copy message'}</button>
        <button type="button" onClick={share} className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-semibold"><Share2 className="h-4 w-4" />Share…</button>
      </div>
    </section>
  )
}
