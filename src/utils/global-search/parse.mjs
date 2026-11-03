import { load } from 'cheerio'
import { canonicalCountry, registrationFromText, safeListingUrl, safeThumbnailUrl } from './sources.mjs'

const clean = value => String(value || '').replace(/\s+/g, ' ').trim()

export function parseSourcePageData(html, source, path = '') {
  const $ = load(html)
  const listings = []
  const removedUrls = []
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
    if (card.is('.outofstock, .sold, .is-sold') || /\b(?:sold|out of stock)\b/i.test(status) || /^(?:sold\b|test\b)/i.test(title) || /\b(?:ad is not real|test description|this is (?:only )?a test)\b/i.test(description)) { removedUrls.push(url); return }
    let price = clean(card.find('.shb-archive-price, .price').first().text())
    if (!price && source.id === 'zebedee') price = description.match(/[£€$]\s*\d[\d.,]*(?:\s*(?:\+\s*VAT|incl\.?\s*VAT|ono))?/i)?.[0] || ''
    // Keep the source currency and tax qualifier. Never infer a price from hours,
    // phone numbers or model numbers; never convert unlike currencies for sorting.
    if (price.length > 90 || /@|https?:\/\//i.test(price)) price = ''
    const registration = registrationFromText(title + ' ' + description)
    const location = source.id === 'secondhand' ? clean(card.find('.shb-archive-seller div').filter((_, el) => $(el).find('small').text().trim() === 'Location').find('strong').text()) : ''
    const country = canonicalCountry(location.split(',').at(-1)?.trim())
    const thumbnail = safeThumbnailUrl(card.find('img').first().attr('src'), source)
    listings.push({ sourceId: source.id, title, url, price: price || null, registration, category: categoryForPath(path), country, thumbnail })
  })
  const knownEmpty = source.id === 'secondhand' && $('.shb-archive').length > 0 && /no (?:ads|adverts|listings|results)/i.test($('main').text())
  if ((!cards.length && !knownEmpty) || (cards.length && !recognized)) throw new Error('Catalogue format unavailable')
  return { listings: [...new Map(listings.map(listing => [listing.url, listing])).values()], removedUrls }
}

export function parseSourcePage(html, source) { return parseSourcePageData(html, source).listings }

export function categoryForPath(path) {
  const key = path.split('/').filter(Boolean).at(-1)
  if (['complete', 'complete-balloons'].includes(key)) return 'complete'
  if (key === 'envelopes') return 'envelopes'
  if (key === 'baskets') return 'baskets'
  if (['burners', 'burner-frames', 'burners-frames'].includes(key)) return 'burners'
  if (['bottomends', 'bottom-ends'].includes(key)) return 'bottom-end'
  if (['tanks', 'fuel-system'].includes(key)) return 'cylinders'
  if (['fans', 'vehicles', 'trailers', 'instruments', 'other', 'inflation-equipment', 'instruments-avionics', 'accessories-spare-parts', 'trailers-transport'].includes(key)) return 'other-equipment'
  return null
}
