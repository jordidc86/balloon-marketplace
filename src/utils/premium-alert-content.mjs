const escape = value => String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')

export function premiumListingAlertContent(listing,origin,now=Date.now()) {
  const early=listing.status==='ACTIVE_PREMIUM'&&Date.parse(listing.public_at)>now
  const url=new URL(`/catalog/${listing.id}`,origin)
  url.searchParams.set('utm_source','premium_alert'); url.searchParams.set('utm_medium','email'); url.searchParams.set('utm_campaign','new_listing')
  const price=Number(listing.price)>0?`${Number(listing.price).toLocaleString('en-IE')} ${listing.currency}`:'Price on request'
  return {
    subject:`AeroTrade Premium: ${listing.title} is now available`,
    html:`<div style="font-family:Arial,sans-serif;background:#fff;max-width:620px;margin:auto;padding:28px;color:#17202a"><p style="font-weight:bold;color:#ea580c">AEROTRADE PREMIUM</p><h1>New equipment on AeroTrade</h1><p>${early?'This promoted listing is in its 48-hour early-access window.':'A new listing is public now. Your Premium membership keeps you informed without checking the catalogue every day.'}</p><h2>${escape(listing.title)}</h2><p>${escape(listing.category)} · <strong>${escape(price)}</strong></p><p><a style="display:inline-block;padding:14px 20px;border-radius:8px;background:#ea580c;color:white;text-decoration:none;font-weight:bold" href="${escape(url.href)}">${early?'View early-access listing':'View listing'}</a></p><p style="font-size:13px;color:#64748b">You receive new listing alerts as part of AeroTrade Premium. <a href="${escape(new URL('/dashboard/searches',origin).href)}">Manage or stop new listing alerts</a>. Saved search alerts and the newsletter are separate preferences.</p></div>`,
  }
}
