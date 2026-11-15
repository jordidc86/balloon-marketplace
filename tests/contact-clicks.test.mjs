import test from 'node:test'
import assert from 'node:assert/strict'
import {sellerContactLinks,validContactClick} from '../src/utils/contact-links.mjs'
import {trafficMonths} from '../src/utils/traffic.mjs'
const listingId='11111111-1111-4111-8111-111111111111'
test('contact destinations use international numbers only for WhatsApp and do not guess countries',()=>{
 const links=sellerContactLinks({email:'seller@example.com',phone:'0034 612 345 678',listingId})
 assert.equal(links.phone,'tel:+34612345678')
 assert.equal(new URL(links.whatsapp).pathname,'/34612345678')
 assert.ok(new URL(links.whatsapp).searchParams.get('text').includes(listingId))
 assert.ok(new URL(links.email).searchParams.get('body').includes(listingId))
 assert.equal(sellerContactLinks({phone:'612345678',listingId}).whatsapp,null)
 assert.equal(sellerContactLinks({phone:'+34 612345678 ext 4',listingId}).whatsapp,null)
 assert.equal(sellerContactLinks({email:'seller@example.com?bcc=evil@example.com',listingId}).email,null)
 assert.equal(sellerContactLinks({phone:'javascript:alert(1)',listingId}).phone,null)
})
test('contact click vocabulary rejects arbitrary channels and private or invalid listing paths',()=>{
 assert.ok(validContactClick({channel:'email',path:`/catalog/${listingId}`}))
 for(const channel of ['VIEW','contact_sent','sms',''])assert.equal(validContactClick({channel,path:`/catalog/${listingId}`}),false)
 for(const path of ['/dashboard','/catalog','/catalog/bad',`/catalog/${listingId}?email=x`])assert.equal(validContactClick({channel:'phone',path}),false)
})
test('monthly history distinguishes unmeasured clicks from measured zero and never turns clicks into enquiries',()=>{
 const r={views:10,visitorDays:2,contactVisitors:0,contacts:0,sources:[]}
 assert.equal(trafficMonths([{day:'2026-10-31',report:r}])[0].clicks,null)
 const m=trafficMonths([{day:'2026-11-14',report:r},{day:'2026-11-15',report:{...r,contactClicks:{startedAt:'2026-11-15T10:00:00Z',clicks:3,visitors:1,channels:[{channel:'email',clicks:2},{channel:'phone',clicks:1}]}}}])[0]
 assert.equal(m.clicks.clicks,3);assert.equal(m.clicks.channels.email,2);assert.equal(m.clicks.visitors,1);assert.equal(m.contactVisitors,0);assert.equal(m.contacts,0)
})

test('enquiry network failure preserves entered text and releases the submit button for a retry',async()=>{
 const {completeInquirySubmission}=await import('../src/utils/inquiry-submission.mjs')
 const states=[];const messages=[];let resets=0
 const context={setSubmitting:v=>states.push(v),setResult:v=>messages.push(v),reset:()=>resets++}
 await completeInquirySubmission({...context,submit:async()=>{throw new Error('Network offline')}})
 assert.deepEqual(states,[true,false]);assert.equal(resets,0);assert.equal(messages.at(-1).success,false)
 await completeInquirySubmission({...context,submit:async()=>({success:false,message:'Please accept the privacy notice'})})
 assert.equal(resets,0);assert.equal(messages.at(-1).message,'Please accept the privacy notice')
 await completeInquirySubmission({...context,submit:async()=>({success:true,message:'Already recorded'})})
 assert.equal(resets,1);assert.equal(messages.at(-1).success,true);assert.equal(states.at(-1),false)
})
