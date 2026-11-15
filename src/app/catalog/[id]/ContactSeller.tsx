'use client'

import { useState } from 'react'
import { Mail, Phone, Loader2, Eye, MessageCircle } from 'lucide-react'
import { revealSellerContact } from './actions'
import { getBrowserCommercialContext } from '@/utils/browser-attribution'

import { sellerContactLinks } from '@/utils/contact-links.mjs'
import { recordContactClick } from '@/utils/contact-click'

interface ContactSellerProps {
  listingId: string
}

type SellerContact = {
  email: string
  phone: string | null
}

export default function ContactSeller({ listingId }: ContactSellerProps) {
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [contact, setContact] = useState<SellerContact | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleReveal = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const sellerContact = await revealSellerContact(listingId, getBrowserCommercialContext())
      setContact(sellerContact)
      setIsRevealed(true)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Could not reveal seller contact')
    } finally {
      setIsLoading(false)
    }
  }

  if (isRevealed && contact) {
    const links = sellerContactLinks({...contact,listingId})
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center animate-in fade-in zoom-in-95">
        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Seller Contact Details</h4>

        <div className="flex flex-col items-center gap-4">
          {links.email && <a href={links.email} onClick={()=>recordContactClick(listingId,'email')} className="flex min-h-11 max-w-full items-center gap-2 text-base font-bold text-primary hover:underline">
            <Mail className="w-5 h-5 shrink-0" />
            <span className="min-w-0 break-all">{contact.email}</span>
          </a>}

          {links.phone && (
            <a href={links.phone} onClick={()=>recordContactClick(listingId,'phone')} className="flex min-h-11 items-center gap-2 text-lg font-medium text-foreground hover:text-primary transition-colors">
              <Phone className="w-5 h-5" />
              {contact.phone}
            </a>
          )}
          {links.whatsapp && <a href={links.whatsapp} onClick={()=>recordContactClick(listingId,'whatsapp')} target="_blank" rel="noopener noreferrer" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-3 font-semibold text-primary-foreground"><MessageCircle className="h-5 w-5 shrink-0" />Open WhatsApp</a>}
          {links.whatsapp && <p className="text-xs text-muted-foreground">WhatsApp opens if the seller uses it with this number.</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleReveal}
        disabled={isLoading}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg disabled:opacity-70"
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <Eye className="w-5 h-5" />
            Show seller contact
          </>
        )}
      </button>
      {error && (
        <p role="alert" className="text-sm text-destructive text-center">{error}</p>
      )}
    </div>
  )
}
