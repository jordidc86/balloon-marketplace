import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import sharp from 'sharp'
import {
  getBrandCarouselImageUrls,
  getBrandPostImageUrl,
  getBrandSocialSourceImagePath,
  getBrandStoryImageUrl,
  getSocialPublishingSlot,
  getListingRotationIndex,
  formatSocialListingPrice,
} from '../src/utils/social-brand-content.ts'

test('scheduled listing opportunities visit every eligible listing, including even inventories', () => {
  for (const count of [1, 2, 3, 4, 8, 10, 99, 100]) {
    const days = Array.from({ length: count * 2 + 8 }, (_, offset) => 20754 + offset)
      .filter((day) => getSocialPublishingSlot(day).type === 'listing').slice(0, count)
    const indices = days.map((day) => getListingRotationIndex(day, count))
    assert.equal(new Set(indices).size, count)
    assert.deepEqual(indices, days.map((day) => getListingRotationIndex(day, count)), 'retries stay deterministic')
  }
  assert.throws(() => getListingRotationIndex(20754, 0), /Invalid/)
})

test('all four brand concepts appear in each cycle and across each scheduled format', () => {
  const byFormat = new Map()
  for (let cycle = 2594; cycle < 2598; cycle++) {
    const concepts = new Set()
    for (let offset = 0; offset < 8; offset++) {
      const slot = getSocialPublishingSlot(cycle * 8 + offset)
      if (!slot.concept) continue
      concepts.add(slot.concept.slug)
      if (!byFormat.has(slot.type)) byFormat.set(slot.type, new Set())
      byFormat.get(slot.type).add(slot.concept.slug)
    }
    assert.equal(concepts.size, 4)
  }
  for (const concepts of byFormat.values()) assert.equal(concepts.size, 4)
  assert.equal(getSocialPublishingSlot(20754, 'brand-story').type, 'brand-story')
  assert.equal(getSocialPublishingSlot(20755, 'listing').type, 'listing')
})

test('social captions show inquiry prices consistently with listing cards', () => {
  assert.equal(formatSocialListingPrice(0, 'EUR'), 'Price on request')
  assert.equal(formatSocialListingPrice(-1, 'EUR'), 'Price on request')
  assert.equal(formatSocialListingPrice(NaN, 'EUR'), 'Price on request')
  assert.equal(formatSocialListingPrice(19900, 'EUR'), '19,900 EUR')
})

test('future brand images use a marketplace-owned destination overlay', () => {
  assert.equal(
    getBrandPostImageUrl('https://aerotrade.app/', 'sell-where-look'),
    'https://aerotrade.app/social/aerotrade-orange-v2/post/sell-where-look.jpg',
  )
  assert.equal(
    getBrandStoryImageUrl('https://aerotrade.app', 'sell-where-look'),
    'https://aerotrade.app/social/aerotrade-orange-v2/story/sell-where-look.jpg',
  )
  assert.deepEqual(getBrandCarouselImageUrls('https://aerotrade.app', 'sell-where-look'), [
    'https://aerotrade.app/social/aerotrade-orange-v2/carousel/sell-where-look/01-hook.jpg',
    'https://aerotrade.app/social/aerotrade-orange-v2/carousel/sell-where-look/02-context.jpg',
    'https://aerotrade.app/social/aerotrade-orange-v2/carousel/sell-where-look/03-action.jpg',
  ])
})

test('every published brand card is a distinct, correctly sized JPEG', async () => {
  const concepts = ['sell-where-look', 'buyers-need-details', 'next-pilot-v2', 'free-upgrade-later']

  for (const concept of concepts) {
    const urls = [
      getBrandPostImageUrl('https://aerotrade.app', concept),
      ...getBrandCarouselImageUrls('https://aerotrade.app', concept),
      getBrandStoryImageUrl('https://aerotrade.app', concept),
    ]
    const hashes = new Set()

    for (const [index, url] of urls.entries()) {
      const image = await readFile(path.join(process.cwd(), 'public', new URL(url).pathname))
      const metadata = await sharp(image).metadata()
      assert.equal(metadata.format, 'jpeg', url)
      assert.equal(metadata.width, 1080, url)
      assert.equal(metadata.height, index === 4 ? 1920 : 1350, url)
      assert.ok(image.length < 8 * 1024 * 1024, url)
      hashes.add(createHash('sha256').update(image).digest('hex'))
    }

    assert.equal(hashes.size, urls.length, `${concept} must not reuse a carousel slide or story image`)
  }
})

test('brand source assets are closed to reviewed concepts and slides', () => {
  assert.equal(
    getBrandSocialSourceImagePath({ slug: 'buyers-need-details', format: 'carousel', slide: 2 }),
    '/social/aerotrade-orange-v1/carousel/buyers-need-details/02-context.jpg',
  )
  assert.throws(() => getBrandSocialSourceImagePath({ slug: '../private', format: 'post' }), /Unknown/)
  assert.throws(() => getBrandSocialSourceImagePath({ slug: 'buyers-need-details', format: 'carousel', slide: 4 }), /Invalid/)
})

test('automatic rotation excludes reels that still contain the legacy destination', () => {
  const slots = Array.from({ length: 32 }, (_, day) => getSocialPublishingSlot(day).type)
  assert.ok(slots.includes('listing'))
  assert.ok(slots.includes('brand-post'))
  assert.ok(slots.includes('brand-story'))
  assert.ok(slots.includes('brand-carousel'))
  assert.ok(!slots.includes('brand-reel'))
})
