import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildListingBreadcrumbJsonLd,
  buildListingProductJsonLd,
  buildBuyerAcquisitionCollectionJsonLd,
  buildMarketplaceIdentityJsonLd,
  buildNewBalloonServiceJsonLd,
  getListingSearchLastModified,
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
  assert.equal(isListingPubliclyIndexable({ ...listing, status: 'SOLD', public_at: '2026-08-20T09:00:00.000Z' }, now), true)
  assert.equal(isListingPubliclyIndexable({ ...listing, status: 'SOLD', public_at: null }, now), false)
  assert.equal(isListingPubliclyIndexable({ ...listing, status: 'DRAFT' }, now), false)
  assert.equal(isListingPubliclyIndexable({ ...listing, status: 'PENDING_PAYMENT' }, now), false)
  assert.equal(isListingPubliclyIndexable({ ...listing, status: 'ACTIVE_PREMIUM', public_at: '2026-08-29T11:00:00.000Z' }, now), false)
  assert.equal(isListingPubliclyIndexable({ ...listing, status: 'ACTIVE_PREMIUM', public_at: '2026-08-29T09:00:00.000Z' }, now), true)
})

test('search freshness uses the latest truthful listing or lifecycle timestamp', () => {
  assert.equal(
    getListingSearchLastModified(
      { updated_at: '2026-07-29T18:55:05.360Z' },
      '2026-08-31T15:52:00.000Z',
    ).toISOString(),
    '2026-08-31T15:52:00.000Z',
  )
  assert.equal(
    getListingSearchLastModified({ updated_at: '2026-08-31T16:00:00.000Z' }, 'invalid').toISOString(),
    '2026-08-31T16:00:00.000Z',
  )
  assert.equal(getListingSearchLastModified({}, null), null)
})

test('public listing SEO excludes private lifecycle states', () => {
  assert.equal(getPublicListingSeoData({ ...listing, status: 'DRAFT' }, 'https://aerotrade.app', now), null)
  const seo = getPublicListingSeoData(listing, 'https://aerotrade.app/', now)
  assert.equal(seo.url, 'https://aerotrade.app/catalog/public-listing')
  assert.deepEqual(seo.images, ['https://cdn.example.com/balloon.jpg'])
  const soldSeo = getPublicListingSeoData({ ...listing, status: 'SOLD', public_at: '2026-08-20T09:00:00.000Z' }, 'https://aerotrade.app/', now)
  assert.match(soldSeo.description, /has been sold/)
})

test('product markup represents a real priced offer and never invents a zero price', () => {
  const product = buildListingProductJsonLd(listing, 'https://aerotrade.app', now)
  assert.equal(product['@type'], 'Product')
  assert.equal(product.offers.price, 45000)
  assert.equal(product.offers.priceCurrency, 'EUR')
  assert.equal(product.offers.itemCondition, 'https://schema.org/UsedCondition')
  assert.equal(product.offers.availability, 'https://schema.org/InStock')
  assert.equal(product.brand.name, 'Schroeder')

  assert.equal(buildListingProductJsonLd({ ...listing, price: 0 }, 'https://aerotrade.app', now), null)
  assert.equal(buildListingProductJsonLd({ ...listing, currency: 'unknown' }, 'https://aerotrade.app', now), null)
  assert.equal(buildListingProductJsonLd({ ...listing, status: 'DRAFT' }, 'https://aerotrade.app', now), null)

  const soldProduct = buildListingProductJsonLd({ ...listing, status: 'SOLD', public_at: '2026-08-20T09:00:00.000Z' }, 'https://aerotrade.app', now)
  assert.equal(soldProduct.offers.availability, 'https://schema.org/SoldOut')
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

test('localized buyer acquisition schema exposes only public listing destinations', () => {
  const collection = buildBuyerAcquisitionCollectionJsonLd({
    siteUrl: 'https://aerotrade.app',
    path: '/de/gebrauchte-heissluftballons',
    name: 'Gebrauchte Heißluftballons',
    description: 'Aktuelle gebrauchte Heißluftballons und Ballonausrüstung in Europa.',
    language: 'de-DE',
    listings: [listing, { ...listing, id: 'draft', status: 'DRAFT' }],
  })

  assert.equal(collection['@type'], 'CollectionPage')
  assert.equal(collection.url, 'https://aerotrade.app/de/gebrauchte-heissluftballons')
  assert.equal(collection.inLanguage, 'de-DE')
  assert.equal(collection.mainEntity.numberOfItems, 1)
  assert.equal(collection.mainEntity.itemListElement[0].url, 'https://aerotrade.app/catalog/public-listing')
})
