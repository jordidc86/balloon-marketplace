import assert from 'node:assert/strict'
import test from 'node:test'
import {
  catalogManufacturers,
  getCatalogManufacturer,
  getCatalogManufacturerPath,
  getCatalogManufacturersWithInventory,
  listingMatchesCatalogManufacturer,
  minimumManufacturerInventoryForIndexing,
} from '../src/utils/catalog-manufacturers.mjs'

test('manufacturer landing pages are a small closed commercial set', () => {
  assert.deepEqual(catalogManufacturers.map((manufacturer) => manufacturer.slug), ['cameron', 'kubicek', 'ultramagic'])
  assert.equal(getCatalogManufacturer('cameron')?.name, 'Cameron Balloons')
  assert.equal(getCatalogManufacturer('cameron?country=Spain'), null)
  assert.equal(getCatalogManufacturerPath('kubicek'), '/catalog/manufacturer/kubicek')
  assert.equal(minimumManufacturerInventoryForIndexing, 2)
})

test('manufacturer matching prefers declared data and uses a bounded title fallback', () => {
  assert.equal(listingMatchesCatalogManufacturer({ title: 'Cameron Z-160', details: { manufacturer: 'Cameron Balloons Ltd.' } }, 'cameron'), true)
  assert.equal(listingMatchesCatalogManufacturer({ title: 'UM C11 basket', details: {} }, 'ultramagic'), true)
  assert.equal(listingMatchesCatalogManufacturer({ title: 'Not a Cameron product', details: { manufacturer: 'Kubicek' } }, 'cameron'), false)
  assert.equal(listingMatchesCatalogManufacturer({ title: 'Schroeder FB6', details: { manufacturer: 'Schroeder' } }, 'cameron'), false)
})

test('only manufacturers with enough current inventory become acquisition pages', () => {
  const listings = [
    { title: 'Cameron Z77', details: { manufacturer: 'Cameron' } },
    { title: 'Cameron Z120', details: { manufacturer: 'Cameron Balloons' } },
    { title: 'Kubicek BB34Z', details: { manufacturer: 'Kubicek' } },
  ]
  assert.deepEqual(getCatalogManufacturersWithInventory(listings, 2).map((manufacturer) => manufacturer.slug), ['cameron'])
})
