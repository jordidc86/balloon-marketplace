import assert from 'node:assert/strict'
import test from 'node:test'
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
    'https://aerotrade.app/api/social-brand-card/sell-where-look?format=post',
  )
  assert.equal(
    getBrandStoryImageUrl('https://aerotrade.app', 'sell-where-look'),
    'https://aerotrade.app/api/social-brand-card/sell-where-look?format=story',
  )
  assert.deepEqual(getBrandCarouselImageUrls('https://aerotrade.app', 'sell-where-look'), [
    'https://aerotrade.app/api/social-brand-card/sell-where-look?format=carousel&slide=1',
    'https://aerotrade.app/api/social-brand-card/sell-where-look?format=carousel&slide=2',
    'https://aerotrade.app/api/social-brand-card/sell-where-look?format=carousel&slide=3',
  ])
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
