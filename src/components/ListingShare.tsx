'use client'

import { useState } from 'react'
import { Copy, Mail, Share2 } from 'lucide-react'
import { buildListingShareText, buildListingShareUrl } from '@/utils/listing-share.mjs'

type ListingShareProps = {
  baseUrl: string
  listingId: string
  title: string
  source?: 'listing_share' | 'seller_share'
  compact?: boolean
}

export default function ListingShare({ baseUrl, listingId, title, source = 'listing_share', compact = false }: ListingShareProps) {
  const [copied, setCopied] = useState(false)
  const text = buildListingShareText(title)
  const urlFor = (medium: 'native' | 'whatsapp' | 'email' | 'copy') => buildListingShareUrl({ baseUrl, listingId, source, medium })
  const whatsappHref = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + urlFor('whatsapp'))
  const emailHref = 'mailto:?subject=' + encodeURIComponent('AeroTrade listing: ' + title) + '&body=' + encodeURIComponent(text + '\n\n' + urlFor('email'))

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(urlFor('copy'))
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
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted">WhatsApp</a>
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
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#25D366] px-3 py-2 text-center text-sm font-semibold text-white">WhatsApp</a>
        <a href={emailHref} className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-semibold"><Mail className="h-4 w-4" />Email</a>
        <button type="button" onClick={copyLink} className="inline-flex items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-semibold"><Copy className="h-4 w-4" />{copied ? 'Link copied' : 'Copy link'}</button>
      </div>
    </section>
  )
}

