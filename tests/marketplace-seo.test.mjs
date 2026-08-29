import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildListingBreadcrumbJsonLd,
  buildListingProductJsonLd,
  buildMarketplaceIdentityJsonLd,
  buildNewBalloonServiceJsonLd,
  getPublicListingSeoData,
  isListingPubliclyIndexable,
  serializeJsonLd,
} from '../src/utils/marketplace-seo.mjs'

const now = new Date('2026-08-29T10:00:00.000Z')
const listing = {
  id: 'public-listing',
  status: 'ACTIVE_PUBLIC',
  public_at: null,
  title: 'Schroeder G42 <script>alert(1)</script>',
  description: 'A documented used balloon.',
  category: 'complete',
  condition: 'Used - excellent',
  price: 45000,
  currency: 'eur',
  details: { manufacturer: 'Schroeder', model: 'G42' },
  images: [{ url: 'https://cdn.example.com/balloon.jpg' }],
}

test('only public listings and matured Premium listings are indexable', () => {
  assert.equal(isListingPubliclyIndexable(listing, now), true)
  assert.equal(isListingPubliclyIndexable({ ...listing, status: 'DRAFT' }, now), false)
  assert.equal(isListingPubliclyIndexable({ ...listing, status: 'PENDING_PAYMENT' }, now), false)
  assert.equal(isListingPubliclyIndexable({ ...listing, status: 'ACTIVE_PREMIUM', public_at: '2026-08-29T11:00:00.000Z' }, now), false)
  assert.equal(isListingPubliclyIndexable({ ...listing, status: 'ACTIVE_PREMIUM', public_at: '2026-08-29T09:00:00.000Z' }, now), true)
})

test('public listing SEO excludes private lifecycle states', () => {
  assert.equal(getPublicListingSeoData({ ...listing, status: 'DRAFT' }, 'https://aerotrade.app', now), null)
  const seo = getPublicListingSeoData(listing, 'https://aerotrade.app/', now)
  assert.equal(seo.url, 'https://aerotrade.app/catalog/public-listing')
  assert.deepEqual(seo.images, ['https://cdn.example.com/balloon.jpg'])
})

test('product markup represents a real priced offer and never invents a zero price', () => {
  const product = buildListingProductJsonLd(listing, 'https://aerotrade.app', now)
  assert.equal(product['@type'], 'Product')
  assert.equal(product.offers.price, 45000)
  assert.equal(product.offers.priceCurrency, 'EUR')
  assert.equal(product.offers.itemCondition, 'https://schema.org/UsedCondition')
  assert.equal(product.brand.name, 'Schroeder')

  assert.equal(buildListingProductJsonLd({ ...listing, price: 0 }, 'https://aerotrade.app', now), null)
  assert.equal(buildListingProductJsonLd({ ...listing, currency: 'unknown' }, 'https://aerotrade.app', now), null)
  assert.equal(buildListingProductJsonLd({ ...listing, status: 'DRAFT' }, 'https://aerotrade.app', now), null)
})

test('structured data contains no executable closing script token', () => {
  const product = buildListingProductJsonLd(listing, 'https://aerotrade.app', now)
  const serialized = serializeJsonLd(product)
  assert.equal(serialized.includes('<script>'), false)
  assert.match(serialized, /\\u003cscript>/)
})

test('breadcrumbs and marketplace identity use only public commercial URLs', () => {
  const breadcrumb = buildListingBreadcrumbJsonLd(listing, 'https://aerotrade.app', now)
  assert.equal(breadcrumb.itemListElement[2].item, 'https://aerotrade.app/catalog/public-listing')

  const identity = buildMarketplaceIdentityJsonLd('https://aerotrade.app/')
  assert.equal(identity['@graph'][0]['@id'], 'https://aerotrade.app/#organization')
  assert.equal(identity['@graph'][1].publisher['@id'], 'https://aerotrade.app/#organization')

  const service = buildNewBalloonServiceJsonLd('https://aerotrade.app')
  assert.equal(service.url, 'https://aerotrade.app/new-balloon')
  assert.match(service.name, /Pasha or Schroeder/)
})
