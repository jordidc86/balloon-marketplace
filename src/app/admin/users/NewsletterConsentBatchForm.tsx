'use client'

import { FormEvent, useState } from 'react'
import { sendNewsletterConsentInvitationBatch } from '../actions'

export default function NewsletterConsentBatchForm({
  batchKey,
  recipients,
}: {
  batchKey: string
  recipients: Array<{ id: string; email: string }>
}) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setResult(null)
    try {
      setResult(await sendNewsletterConsentInvitationBatch(new FormData(event.currentTarget)))
    } catch {
      setResult({ success: false, message: 'The consent batch could not be completed. Refresh the reviewed accounts before retrying.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-slate-900">
      <input type="hidden" name="expected_batch_key" value={batchKey} />
      <h2 className="text-lg font-semibold">Exact one-time consent batch</h2>
      <p className="mt-1 text-sm">These are the {recipients.length} accounts currently eligible after durable exclusions and earlier accepted invitations. Review every address below. Exclude test or non-customer accounts before authorizing.</p>
      <ul className="mt-3 max-h-48 list-disc overflow-y-auto pl-5 text-sm">
        {recipients.map((recipient) => <li key={recipient.id}>{recipient.email}</li>)}
      </ul>
      <label className="mt-4 flex items-start gap-2 text-sm">
        <input required type="checkbox" name="newsletter_consent_batch_authorization" value="yes" className="mt-1" />
        <span>I reviewed these exact {recipients.length} accounts and authorize one preference invitation to each. This does not subscribe anyone.</span>
      </label>
      <button disabled={pending} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? 'Sending and verifying…' : `Send exactly ${recipients.length} invitations`}
      </button>
      {result ? <p role="status" className={`mt-3 text-sm font-semibold ${result.success ? 'text-emerald-800' : 'text-red-800'}`}>{result.message}</p> : null}
    </form>
  )
}
