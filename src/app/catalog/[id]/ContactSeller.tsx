'use client'

import { useState } from 'react'
import { Mail, Phone, Loader2, Eye } from 'lucide-react'
import { revealSellerContact } from './actions'

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
      const sellerContact = await revealSellerContact(listingId)
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
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center animate-in fade-in zoom-in-95">
        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Seller Contact Details</h4>

        <div className="flex flex-col items-center gap-4">
          <a href={`mailto:${contact.email}`} className="flex items-center gap-2 text-xl font-bold text-primary hover:underline">
            <Mail className="w-5 h-5" />
            {contact.email}
          </a>

          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-2 text-lg font-medium text-foreground hover:text-primary transition-colors">
              <Phone className="w-5 h-5" />
              {contact.phone}
            </a>
          )}
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
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
    </div>
  )
}
