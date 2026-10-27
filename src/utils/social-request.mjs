import https from 'node:https'
import { AsyncLocalStorage } from 'node:async_hooks'

const budgets = new AsyncLocalStorage()
export function withSocialBudget(milliseconds, operation) {
  return budgets.run(AbortSignal.timeout(milliseconds), operation)
}
export function socialRequestSignal(milliseconds = 20_000) {
  const total = budgets.getStore()
  total?.throwIfAborted()
  return total ? AbortSignal.any([total, AbortSignal.timeout(milliseconds)]) : AbortSignal.timeout(milliseconds)
}
export function assertSocialBudget() { budgets.getStore()?.throwIfAborted() }
export function socialFetch(input, init = {}) {
  const signal = socialRequestSignal()
  return fetch(input, { ...init, signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal })
}

export function boundedHttps(url, options = {}, body, maxBytes = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { ...options, signal: socialRequestSignal() }, (response) => {
      const chunks = []
      let bytes = 0
      response.on('error', () => reject(new Error('Social response interrupted; result may be unverified')))
      response.on('aborted', () => reject(new Error('Social response interrupted; result may be unverified')))
      response.on('data', (chunk) => {
        bytes += chunk.length
        if (bytes > maxBytes) { request.destroy(new Error('Social response exceeds byte limit')); return }
        chunks.push(Buffer.from(chunk))
      })
      response.on('end', () => resolve({ status: response.statusCode || 0, body: Buffer.concat(chunks) }))
    })
    request.on('error', (error) => {
      // Never expose request URLs or credential-bearing headers through errors.
      reject(new Error(error.name === 'AbortError' ? 'Social request timeout; result may be unverified' : 'Social request failed; result may be unverified'))
    })
    if (body) request.write(body)
    request.end()
  })
}

export function assertSocialImageUrl(value) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || !['vqdpveyshgvdhbsgskns.supabase.co', 'images.unsplash.com'].includes(url.hostname)) {
    throw new Error('Untrusted social image source')
  }
  return url.toString()
}
