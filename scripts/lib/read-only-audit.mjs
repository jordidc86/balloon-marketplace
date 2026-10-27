// Fail closed before any request if an audit accidentally attempts a mutation.
export function readOnlyFetch(input, init = {}) {
  const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  if (!['GET', 'HEAD'].includes(method)) throw new Error('Read-only audit blocked a non-read request')
  return fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) })
}

// An exact count detects API row caps and concurrent insert/delete drift. This
// is a bounded observation, not a transactional database snapshot.
export async function readAllRows(queryFactory, { pageSize = 500, maxPages = 200 } = {}) {
  const rows = []
  let expected = null
  for (let page = 0; page < maxPages; page++) {
    const { data, count, error } = await queryFactory().range(rows.length, rows.length + pageSize - 1)
    if (error || !Array.isArray(data) || !Number.isSafeInteger(count)) throw new Error('Audit read failed or completeness could not be established')
    if (expected !== null && count !== expected) throw new Error('Dataset changed while paginating; repeat the observation')
    expected = count
    rows.push(...data)
    if (rows.length === expected) return rows
    if (!data.length || rows.length > expected) throw new Error('Audit pagination was incomplete')
  }
  throw new Error('Audit pagination limit exceeded; no complete report produced')
}

export async function readAllStripe(list, params = {}, maxPages = 200) {
  const data = []
  let cursor
  for (let page = 0; page < maxPages; page++) {
    const response = await list({ ...params, limit: 100, ...(cursor ? { starting_after: cursor } : {}) })
    if (!Array.isArray(response.data) || typeof response.has_more !== 'boolean') throw new Error('Invalid Stripe pagination response')
    data.push(...response.data)
    if (!response.has_more) return { data, complete: true }
    const next = response.data.at(-1)?.id
    if (!next || next === cursor) throw new Error('Stripe pagination made no progress')
    cursor = next
  }
  throw new Error('Stripe pagination limit exceeded; no complete report produced')
}

export async function readMatchingRows(supabase, table, columns, key, values, orderKey) {
  const rows = []
  const unique = [...new Set(values)]
  for (let offset = 0; offset < unique.length; offset += 50) {
    rows.push(...await readAllRows(() => supabase.from(table).select(columns, { count: 'exact' })
      .in(key, unique.slice(offset, offset + 50)).order(orderKey)))
  }
  return rows
}

export function reconcileChargeReceipts(charges, receipts) {
  const uniqueCharges = new Map(charges.map((charge) => [charge.id, charge]))
  const receiptsByCharge = new Map()
  for (const receipt of receipts) {
    const group = receiptsByCharge.get(receipt.charge_id) || []
    group.push(receipt)
    receiptsByCharge.set(receipt.charge_id, group)
  }
  let matched = 0
  let missing = 0
  let inconsistent = 0
  for (const charge of uniqueCharges.values()) {
    const group = receiptsByCharge.get(charge.id) || []
    if (!group.length) { missing++; continue }
    const receipt = group[0]
    if (group.length !== 1 || receipt.livemode !== charge.livemode || receipt.amount_minor !== charge.amount
      || String(receipt.currency).toLowerCase() !== String(charge.currency).toLowerCase() || !receipt.accepted_at) {
      inconsistent++; continue
    }
    matched++
  }
  return { status: missing || inconsistent ? 'attention_required' : 'verified', charges: uniqueCharges.size, matched, missing, inconsistent }
}
