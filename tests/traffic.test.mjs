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

test('channel grouping merges known aliases without guessing malformed tags or losing campaigns', async()=>{
 const {trafficChannels,trafficChannel}=await import('../src/utils/traffic.mjs')
 const raw=[{source:'facebook',campaign:'scheduled_listing',visitors:6,contacts:2},{source:'l.facebook.com',campaign:'',visitors:5,contacts:1},{source:'fac',campaign:'',visitors:3,contacts:0},{source:'abdfcbbx',campaign:'',visitors:5,contacts:0}]
 const groups=trafficChannels(raw)
 assert.equal(groups.find(g=>g.channel==='Facebook').visitors,11)
 assert.equal(groups.find(g=>g.channel==='Facebook').contacts,3)
 assert.deepEqual(groups.find(g=>g.channel==='Facebook').originals,raw.slice(0,2))
 assert.equal(groups.reduce((n,g)=>n+g.visitors,0),19)
 assert.equal(trafficChannel('ig'),'Instagram')
 assert.equal(trafficChannel('google.com.evil.com'),'Other / unrecognised')
 assert.equal(trafficChannel('fac'),'Other / unrecognised')
 assert.equal(trafficChannel('direct'),'Direct / unknown')
})
test('monthly totals preserve closed months and distinguish requests from converted visitor-days', async()=>{
 const {trafficMonths}=await import('../src/utils/traffic.mjs')
 const report={views:10,visitorDays:3,contacts:4,contactVisitors:1,sources:[{source:'ig',campaign:'a',visitors:3,contacts:1}]}
 const months=trafficMonths([{day:'2026-10-31',report},{day:'2026-11-01',report},{day:'2026-11-02',report}])
 assert.deepEqual(months.map(m=>[m.month,m.views,m.visitorDays,m.contacts,m.contactVisitors]),[['2026-11',20,6,8,2],['2026-10',10,3,4,1]])
 assert.equal(months[0].channels[0].channel,'Instagram')
 assert.equal(months[0].channels[0].visitors,6)
 assert.equal(months[0].firstDay,'2026-11-01')
})
