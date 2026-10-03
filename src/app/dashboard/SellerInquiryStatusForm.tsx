'use client'

import { FormEvent, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { updateSellerInquiryStatus } from './actions'

const statuses = [
  ['CONTACTED', 'Contacted'],
  ['QUALIFIED', 'Qualified'],
  ['NEGOTIATING', 'Negotiating'],
  ['LOST', 'Lost'],
  ['SPAM', 'Spam'],
]

export default function SellerInquiryStatusForm({ inquiryId, status }: { inquiryId: string; status: string }) {
  const router = useRouter()
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    const formData = new FormData(event.currentTarget)
    submitting.current = true
    setPending(true)
    setResult(null)
    try {
      const saved = await updateSellerInquiryStatus(inquiryId, formData)
      const label = statuses.find(([value]) => value === saved.status)?.[1] || saved.status
      setResult({ success: true, message: `Saved: ${label}.` })
      router.refresh()
    } catch {
      setResult({ success: false, message: 'Could not save the status. Please try again.' })
    } finally {
      submitting.current = false
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-busy={pending}>
      <div className="flex items-center gap-2">
        <select key={status} name="status" aria-label="Enquiry status" disabled={pending} onChange={() => setResult(null)} defaultValue={status === 'NEW' || status === 'SELLER_NOTIFIED' ? 'CONTACTED' : status} className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60">
          {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="submit" disabled={pending} className="flex min-w-24 items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-60">
          {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> : null}
          {pending ? 'Saving...' : 'Save'}
        </button>
      </div>
      <p role="status" aria-live="polite" className={`min-h-4 text-xs ${result?.success ? 'text-muted-foreground' : 'text-destructive'}`}>{result?.message}</p>
    </form>
  )
}
