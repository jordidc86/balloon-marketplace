import assert from 'node:assert/strict'
import test from 'node:test'
import { catalogCategories, getCatalogCategory, getCatalogCategoryPath } from '../src/utils/catalog-categories.mjs'

test('catalog categories have unique clean paths and useful search copy', () => {
  assert.equal(new Set(catalogCategories.map((category) => category.slug)).size, catalogCategories.length)

  for (const category of catalogCategories) {
    assert.equal(getCatalogCategory(category.slug), category)
    assert.equal(getCatalogCategoryPath(category.slug), `/catalog/category/${category.slug}`)
    assert.match(category.heading, /used hot air balloon/i)
    assert.ok(category.description.length > 80)
  }
})

test('unknown and query-like category values fail closed', () => {
  assert.equal(getCatalogCategory('unknown'), null)
  assert.equal(getCatalogCategory('complete?country=Spain'), null)
  assert.equal(getCatalogCategory(null), null)
})
