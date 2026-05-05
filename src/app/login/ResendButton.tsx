'use client'

import { useState } from 'react'
import { resendConfirmationEmail } from './actions'
import { Mail, Check, AlertCircle } from 'lucide-react'

export function ResendButton({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleResend = async () => {
    if (!email) {
      setStatus('error')
      setMessage('Please enter your email first.')
      return
    }

    setStatus('loading')
    const result = await resendConfirmationEmail(email)
    
    if (result.error) {
      setStatus('error')
      setMessage(result.error)
    } else {
      setStatus('success')
      setMessage('Confirmation email sent!')
    }
  }

  return (
    <div className="mt-4 border-t pt-4">
      {status === 'success' ? (
        <div className="flex items-center gap-2 text-green-600 bg-green-500/10 p-3 rounded-lg text-sm">
          <Check className="w-4 h-4" />
          <p>{message}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={status === 'loading'}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 text-sm font-medium text-primary hover:bg-primary/5 rounded-lg border border-primary/20 transition-all"
        >
          {status === 'loading' ? (
            'Sending...'
          ) : (
            <>
              <Mail className="w-4 h-4" />
              Resend Confirmation Email
            </>
          )}
        </button>
      )}
      {status === 'error' && (
        <p className="mt-2 text-xs text-destructive flex items-center gap-1.5 px-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {message}
        </p>
      )}
    </div>
  )
}
