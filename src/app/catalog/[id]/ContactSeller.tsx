'use client'

import { useState } from 'react'
import { Mail, Phone, Loader2, Eye } from 'lucide-react'
import { logContactReveal } from './actions'

interface ContactSellerProps {
  listingId: string
  email: string
  phone?: string | null
}

export default function ContactSeller({ listingId, email, phone }: ContactSellerProps) {
  const [isRevealed, setIsRevealed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleReveal = async () => {
    setIsLoading(true)
    try {
      await logContactReveal(listingId)
      setIsRevealed(true)
    } catch (e) {
      console.error(e)
      // Even if tracking fails due to auth or network, reveal it for UX (or enforce login)
      setIsRevealed(true) 
    } finally {
      setIsLoading(false)
    }
  }

  if (isRevealed) {
    return (
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 text-center animate-in fade-in zoom-in-95">
        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">Seller Contact Details</h4>
        
        <div className="flex flex-col items-center gap-4">
          <a href={`mailto:${email}`} className="flex items-center gap-2 text-xl font-bold text-primary hover:underline">
            <Mail className="w-5 h-5" />
            {email}
          </a>
          
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-2 text-lg font-medium text-foreground hover:text-primary transition-colors">
              <Phone className="w-5 h-5" />
              {phone}
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <button 
      onClick={handleReveal}
      disabled={isLoading}
      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
    >
      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <>
          <Eye className="w-5 h-5" />
          Reveal Contact Details
        </>
      )}
    </button>
  )
}
