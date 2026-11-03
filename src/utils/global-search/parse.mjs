import { load } from 'cheerio'
import { registrationFromText, safeListingUrl } from './sources.mjs'

const clean = value => String(value || '').replace(/\s+/g, ' ').trim()

export function parseSourcePage(html, source) {
  const $ = load(html)
  const listings = []
  let recognized = 0
  const selectors = {
    balloons4sale: '.article_clickable', zebedee: '.listing-item',
    secondhand: '.shb-archive-ad', swapballoon: '.wc-block-grid__product, li.product:not(.product-category)',
    barnstormers: '.classified_single',
  }
  const selector = selectors[source.id]
  if (!selector) throw new Error('Unsupported source')
  const cards = $(selector)
  cards.each((_, element) => {
    const card = $(element)
    const links = {
      balloons4sale: 'a[href*="/article/"]', zebedee: 'a.title', secondhand: 'h2 a',
      swapballoon: 'a[href*="/4sale/"]', barnstormers: 'a.listing_header',
    }
    const link = card.find(links[source.id]).first()
    const url = safeListingUrl(link.attr('href'), source)
    const title = clean(source.id === 'swapballoon' ? card.find('.wc-block-grid__product-title, .woocommerce-loop-product__title').first().text() : link.text()).slice(0, 160)
    const description = clean(card.find('.cat_content, .excerpt, .shb-archive-excerpt, .body').text())
    const status = clean(card.find('.sold-out-label, .stock, .action_phrase, .shb-status, .shb-badge').text())
    if (!url || !title || /@|https?:\/\//i.test(title)) return
    recognized++
    if (card.is('.outofstock, .sold, .is-sold') || /\b(?:sold|out of stock)\b/i.test(status) || /^(?:sold\b|test\b)/i.test(title) || /\b(?:ad is not real|test description|this is (?:only )?a test)\b/i.test(description)) return
    let price = clean(card.find('.shb-archive-price, .price').first().text())
    if (!price && source.id === 'zebedee') price = description.match(/[£€$]\s*\d[\d.,]*(?:\s*(?:\+\s*VAT|incl\.?\s*VAT|ono))?/i)?.[0] || ''
    // Keep the source currency and tax qualifier. Never infer a price from hours,
    // phone numbers or model numbers; never convert unlike currencies for sorting.
    if (price.length > 90 || /@|https?:\/\//i.test(price)) price = ''
    const registration = registrationFromText(title + ' ' + description)
    listings.push({ sourceId: source.id, title, url, price: price || null, registration })
  })
  const knownEmpty = source.id === 'secondhand' && $('.shb-archive').length > 0 && /no (?:ads|adverts|listings|results)/i.test($('main').text())
  if ((!cards.length && !knownEmpty) || (cards.length && !recognized)) throw new Error('Catalogue format unavailable')
  return [...new Map(listings.map(listing => [listing.url, listing])).values()]
}
