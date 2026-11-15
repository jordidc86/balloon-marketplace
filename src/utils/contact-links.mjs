export function sellerContactLinks({email,phone,listingId}) {
  const normalized = typeof phone === 'string' ? phone.trim().replace(/[\s().-]/g,'').replace(/^00/,'+') : ''
  const international = /^\+[1-9][0-9]{7,14}$/.test(normalized)
  const dialable = /^\+?[0-9]{5,15}$/.test(normalized)
  return {
    email: typeof email === 'string' && /^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email) ? `mailto:${email}?subject=${encodeURIComponent('AeroTrade listing enquiry')}&body=${encodeURIComponent(`Hello, I am interested in your listing: https://aerotrade.app/catalog/${listingId}`)}` : null,
    phone: dialable ? `tel:${normalized}` : null,
    whatsapp: international ? `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(`Hello, I am interested in your listing: https://aerotrade.app/catalog/${listingId}`)}` : null,
  }
}
export function validContactClick(body) {
  return body && ['email','phone','whatsapp'].includes(body.channel) && /^\/catalog\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.path || '')
}
