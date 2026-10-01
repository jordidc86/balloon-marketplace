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
} from '../src/utils/social-brand-content.ts'

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
