import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDeliverableNewsletterEmail } from '../src/utils/newsletter-deliverable-email.mjs'
import { parsePublicNewsletterOptIn, signPublicNewsletterUnsubscribe, verifyPublicNewsletterUnsubscribe } from '../src/utils/newsletter-public-subscription.mjs'
import { buildNewsletterRecipients } from '../src/utils/newsletter-recipients.mjs'
import { buildPublicNewsletterConfirmation } from '../src/utils/newsletter-public-confirmation.mjs'

test('reserved domains cannot enter signup, confirmation or test dispatch', () => {
  for (const email of ['a@example.com', 'a@sub.example.org', 'a@EXAMPLE.net', 'a@host.test', 'a@host.invalid', 'a@host.localhost', 'a@host.example']) {
    assert.equal(normalizeDeliverableNewsletterEmail(email), null)
    const form = new FormData(); form.set('email', email); form.set('privacy_consent', 'yes')
    assert.throws(() => parsePublicNewsletterOptIn(form), /valid email/)
    assert.equal(buildPublicNewsletterConfirmation({ email }), null)
    assert.deepEqual(buildNewsletterRecipients({ testEmail: email }).recipients, [])
    assert.deepEqual(buildNewsletterRecipients({ users: [{ id: 'one', email, newsletter_consent_status: 'ACTIVE', newsletter_consented_at: '2026-01-01' }] }).recipients, [])
  }
  assert.equal(normalizeDeliverableNewsletterEmail(' A@Example.co.uk '), 'a@example.co.uk')
})
test('historical unsubscribe signatures remain valid even for reserved addresses', () => {
  const input = { subscriptionId: '3c1d1bca-5c56-4c96-bab1-bf537ad9b93a', email: 'a@example.com', secret: 'local-test-only-secret-at-least-20-characters' }
  assert.equal(verifyPublicNewsletterUnsubscribe({ ...input, token: signPublicNewsletterUnsubscribe(input) }), true)
})

test('public signup action rejects reserved addresses before headers, database or provider calls', async () => {
  const { readFile } = await import('node:fs/promises')
  const { transpileModule, ModuleKind } = await import('typescript')
  const fail = '() => { throw new Error("Side effect was reached before email rejection") }'
  const stub = `data:text/javascript;base64,${Buffer.from(`export const headers=${fail}; export const createAdminClient=${fail}; export const sendCommercialReceiptEmail=${fail}; export const siteUrl='https://aerotrade.app'; export const commercialJourneyKey=${fail}; export const normalizeCommercialContext=${fail};`).toString('base64')}`
  let source = await readFile(new URL('../src/app/newsletter/actions.ts', import.meta.url), 'utf8')
  for (const name of ['next/headers', '@/utils/supabase/server', '@/utils/commercial-notification', '@/utils/site', '@/utils/commercial-attribution.mjs']) source = source.replace(`'${name}'`, `'${stub}'`)
  source = source.replaceAll("@/utils/", new URL('../src/utils/', import.meta.url).href)
  const { requestPublicNewsletterOptIn } = await import(`data:text/javascript;base64,${Buffer.from(transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext } }).outputText).toString('base64')}`)
  const form = new FormData(); form.set('email', 'pilot@example.com'); form.set('privacy_consent', 'yes')
  const result = await requestPublicNewsletterOptIn({ success: false, message: '' }, form)
  assert.equal(result.success, false)
  assert.match(result.message, /valid email/)
})
