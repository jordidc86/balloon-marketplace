import test from 'node:test'
import assert from 'node:assert/strict'
import { trafficPath, trafficSource, validTrafficEvent, trackedSearchUrl } from '../src/utils/traffic.mjs'
import { buildNewsletterCatalogUrl } from '../src/utils/newsletter-links.mjs'
test('traffic excludes account and token URLs and keeps only known public paths',()=>{
 for(const p of ['/admin','/dashboard','/auth/callback','/catalog?email=private@example.com','/catalog/abc','/api/traffic','/catalog/123/edit']) assert.equal(trafficPath(p),null)
 assert.equal(trafficPath('/catalog'),'/catalog')
 assert.ok(validTrafficEvent({eventId:'76fd4815-60bf-4b74-bdd2-75f2d7439c54',path:'/'}))
 assert.equal(validTrafficEvent({eventId:'bad',path:'/'}),null)
})
test('attribution strips referrer paths and rejects personal-data campaign labels',()=>{
 assert.deepEqual(trafficSource({referrer:'https://www.google.com/search?q=private',utmCampaign:'email@example.com'}),{source:'www.google.com',campaign:'',medium:''})
 assert.equal(trafficSource({referrer:'https://aerotrade.app/catalog'}).source,'direct')
 assert.equal(trafficSource({utmSource:'Facebook',utmMedium:'organic_social',utmCampaign:'search_launch'}).source,'facebook')
})
test('campaign links identify channel and preserve the real catalogue destination',()=>{
 const u=new URL(trackedSearchUrl('facebook','post'));assert.equal(u.pathname,'/catalog');assert.equal(u.searchParams.get('utm_source'),'facebook')
 assert.throws(()=>trackedSearchUrl('unknown'))
 const n=new URL(buildNewsletterCatalogUrl({baseUrl:'https://aerotrade.app',periodKey:'2026-11-16'}));assert.equal(n.searchParams.get('utm_campaign'),'biweekly_marketplace_2026-11-16');assert.equal(n.searchParams.get('utm_content'),'browse_catalog')
 assert.throws(()=>buildNewsletterCatalogUrl({baseUrl:'https://aerotrade.app',periodKey:'invalid'}))
})
