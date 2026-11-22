import assert from 'node:assert/strict'
import test from 'node:test'
import { assessNewBalloonQuote, buildNewBalloonQuoteAdminNotification } from '../src/utils/new-balloon-admin-notification.mjs'

const legitimate = {
  name: 'Buyer Pilot', email: 'pilot@example.com', country: 'Spain',
  equipment_type: 'burner', volume_or_capacity: 'MK21 double burner',
  notes: 'I need a double burner for my balloon, with REGO fittings.',
}
const carAdvert = 'Ищете автомобиль? Автосалон «Федерал» предлагает машины в наличии и привоз под заказ из Кореи, Китая, Японии, Европы, ОАЭ и США. Поможем выбрать автомобиль, проверить его историю и состояние. Возможен трейд-ин.'

test('unrelated car sales promotion is explained as probable spam without changing the request', () => {
  const request = Object.freeze({ ...legitimate, country: 'Russia', notes: carAdvert, colors_or_branding: carAdvert, volume_or_capacity: 'Пенза' })
  const review = assessNewBalloonQuote(request)
  assert.equal(review.level, 'likely_spam')
  assert.equal(review.reasons.length, 2)
  assert.match(review.reasons.join(' '), /coches/)
  assert.match(review.reasons.join(' '), /mismo texto/)
  assert.equal(request.notes, carAdvert)
})

test('country, Russian email provider, language and unspecified budget do not establish spam', () => {
  for (const country of ['Spain', 'Russia', 'Angola']) {
    const review = assessNewBalloonQuote({ ...legitimate, country, email: 'pilot@mail.ru', budget_range: 'not-specified', notes: 'Нужна горелка для воздушного шара, два блока и соединение REGO.' })
    assert.equal(review.level, 'no_clear_signals')
  }
})

test('a car dealership asking for a promotional balloon is not treated as unrelated spam', () => {
  assert.equal(assessNewBalloonQuote({ ...legitimate, notes: 'Our car dealership offers cars for sale. We need a Pasha balloon for our advertising team.' }).level, 'no_clear_signals')
  assert.equal(assessNewBalloonQuote({ ...legitimate, notes: 'Автосалон предлагает машины под заказ. Нужен воздушный шар для рекламы.' }).level, 'no_clear_signals')
})

test('repetition or sparse requirements need review but are not sufficient for a spam verdict', () => {
  const detail = 'I need a Schroeder balloon for commercial flights with passengers and would like information about basket configurations.'
  assert.equal(assessNewBalloonQuote({ ...legitimate, notes: detail, colors_or_branding: detail }).level, 'needs_review')
  assert.equal(assessNewBalloonQuote({ name: 'New Pilot', equipment_type: 'burner' }).level, 'needs_review')
  assert.equal(assessNewBalloonQuote({ ...legitimate, name: 'RobertAgifs' }).level, 'likely_spam')
})

test('initial and reminder emails retain the same assessment, original details and operational link', () => {
  const request = { ...legitimate, notes: carAdvert, colors_or_branding: carAdvert }
  const initial = buildNewBalloonQuoteAdminNotification({ request, publicSiteUrl: 'https://aerotrade.app' })
  const reminder = buildNewBalloonQuoteAdminNotification({ request, publicSiteUrl: 'https://aerotrade.app/', reminder: true })
  assert.deepEqual(initial.assessment, reminder.assessment)
  for (const email of [initial, reminder]) {
    assert.match(email.html, /Valoración orientativa: Probable spam/)
    assert.ok(email.html.includes(carAdvert))
    assert.match(email.html, /https:\/\/aerotrade.app\/admin\/commercial/)
    assert.match(email.html, /No verifica la identidad/)
    assert.match(email.html, /no se cierra automáticamente/)
  }
  assert.match(initial.subject, /Buyer Pilot/)
  assert.equal(reminder.subject, 'AeroTrade: new-balloon quote awaiting action')
})

test('email output escapes untrusted HTML, bounds displayed fields and strips header newlines', () => {
  const notification = buildNewBalloonQuoteAdminNotification({
    request: { ...legitimate, name: 'Pilot\r\nBcc: other', notes: '<img src=x onerror=alert(1)>', submission_key: 'private-hash', journey_key: 'private-journey' },
    publicSiteUrl: 'https://aerotrade.app',
  })
  assert.ok(notification.html.includes('&lt;img src=x onerror=alert(1)&gt;'))
  assert.ok(!notification.html.includes('<img'))
  assert.ok(!notification.html.includes('private-hash'))
  assert.ok(!notification.html.includes('private-journey'))
  assert.ok(!/[\r\n]/.test(notification.subject))
  assert.match(notification.html, /Sin señales claras de spam/)
})
