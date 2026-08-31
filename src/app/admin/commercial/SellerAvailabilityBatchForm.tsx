'use client'

import { FormEvent, useState } from 'react'
import { requestSellerAvailabilityDigestBatch } from '../actions'

type Scope = {
  sellerId: string
  inventoryKey: string
}

export default function SellerAvailabilityBatchForm({
  batchKey,
  scopes,
  sellerCount,
  listingCount,
}: {
  batchKey: string
  scopes: Scope[]
  sellerCount: number
  listingCount: number
}) {
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPending(true)
    setResult(null)
    try {
      setResult(await requestSellerAvailabilityDigestBatch(new FormData(event.currentTarget)))
    } catch {
      setResult({ success: false, message: 'The grouped request could not be completed. Refresh the evidence before retrying.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900">
      <input type="hidden" name="expected_batch_key" value={batchKey} />
      <input type="hidden" name="approved_scopes" value={JSON.stringify(scopes)} />
      <p className="font-semibold">One controlled availability batch is ready</p>
      <p className="mt-1 text-sm">This sends exactly one grouped operational email to each of {sellerCount} sellers, covering {listingCount} currently unconfirmed active listings. It does not change publication, price, ownership or payment.</p>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input required type="checkbox" name="availability_batch_authorization" value="yes" className="mt-1" />
        <span>I authorize this exact {sellerCount}-seller, {listingCount}-listing batch after reviewing the portfolios below.</span>
      </label>
      <button disabled={pending} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? 'Sending and verifying…' : `Send ${sellerCount} grouped requests`}
      </button>
      {result ? <p role="status" className={`mt-3 text-sm font-semibold ${result.success ? 'text-emerald-800' : 'text-red-800'}`}>{result.message}</p> : null}
    </form>
  )
}
