import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSavedSearch,savedSearchMatches,signSearchStop,verifySearchStop } from '../src/utils/saved-searches.mjs'
import { dispatchPreparedSearchDigest,searchDigestEmail } from '../src/utils/saved-search-delivery.mjs'
import { premiumListingAlertContent } from '../src/utils/premium-alert-content.mjs'

const id='00000000-0000-4000-8000-000000000001'
const search={id,query:'Cameron',category:'complete',country:'Spain',manufacturer:''}
const native=[{id,title:'Cameron N77',category:'complete',location_country:'Spain',status:'ACTIVE_PUBLIC',price:7500,currency:'EUR'},
  {id:id.replace(/1$/,'2'),title:'Cameron Z90',category:'complete',location_country:'Spain',status:'ACTIVE_PREMIUM',price:19500,currency:'EUR'},
  {id:id.replace(/1$/,'3'),title:'Cameron SOLD',category:'complete',location_country:'Spain',status:'SOLD',price:2000,currency:'EUR'}]
const now=Date.parse('2026-11-18T08:00:00Z')
const snapshot={sourceId:'balloons4sale',pages:[{path:'/complete',checkedAt:new Date(now).toISOString(),listings:[{sourceId:'balloons4sale',title:'Cameron Z77',url:'https://www.balloons4sale.eu/article/1234/cameron',price:'€9,000',category:'complete',country:'Spain'}]}]}

test('saved searches validate equipment filters and reject contact data, URLs and empty searches',()=>{
  assert.deepEqual(normalizeSavedSearch(search),{query:'Cameron',category:'complete',country:'Spain',manufacturer:''})
  for(const query of ['test@example.com','https://example.com','+34600123456']) assert.throws(()=>normalizeSavedSearch({query}))
  assert.throws(()=>normalizeSavedSearch({}))
  assert.throws(()=>normalizeSavedSearch({category:'admin'}))
  assert.throws(()=>normalizeSavedSearch({manufacturer:'invented'}))
})

test('matching includes free and promoted native listings plus fresh external results, excluding sold/stale/mismatched results',()=>{
  assert.equal(savedSearchMatches(search,native,[snapshot],now).length,3)
  assert.equal(savedSearchMatches(search,native,[snapshot],now+73*3600000).length,2)
  assert.equal(savedSearchMatches({...search,country:'France'},native,[snapshot],now).length,0)
  assert.equal(savedSearchMatches({...search,query:'Z77'},native,[snapshot],now)[0].source,'Balloons4sale.eu')
})

test('stop tokens are bound to one search and do not permit stopping another search',()=>{
  const token=signSearchStop(id,'test-only-secret')
  assert.ok(verifySearchStop(id,token,'test-only-secret'))
  assert.equal(verifySearchStop(id.replace(/1$/,'2'),token,'test-only-secret'),false)
  assert.equal(verifySearchStop(id,token,'different-secret'),false)
  assert.equal(verifySearchStop(id,undefined,'test-only-secret'),false)
})

const digest={id,status:'prepared',items:[{key:'native:'+id,path:'/catalog/'+id,title:'Cameron <script>bad</script>',price:'7500 EUR',source:'AeroTrade'}],match_count:1}
test('email content escapes seller text, tracks links and never claims free/external adverts are exclusive',()=>{
  const email=searchDigestEmail(search,digest,'https://aerotrade.app','test-only-secret')
  assert.match(email.html,/&lt;script&gt;/)
  assert.doesNotMatch(email.html,/<script>/)
  assert.match(email.html,/utm_campaign=saved_search/)
  assert.match(email.html,/Stop this search alert/)
  assert.throws(()=>searchDigestEmail(search,{...digest,items:[{url:'javascript:alert(1)'}]},'https://aerotrade.app','secret'))
  const free=premiumListingAlertContent({...native[0],public_at:new Date(now).toISOString()},'https://aerotrade.app',now)
  assert.match(free.html,/public now/)
  assert.doesNotMatch(free.html,/48-hour early-access window/)
  const early=premiumListingAlertContent({...native[1],public_at:new Date(now+48*3600000).toISOString()},'https://aerotrade.app',now)
  assert.match(early.html,/48-hour early-access window/)
  assert.match(free.html,/utm_campaign=new_listing/)
})

function ledger({failReadback=false}={}) {
  const state={id,status:'prepared',provider_message_id:null}
  return {state,from(){
    let patch;const conditions=[]
    const apply=()=>{
      if(!conditions.every(([key,value])=>state[key]===value)) return {data:null,error:null}
      if(failReadback&&patch.status==='accepted') return {data:null,error:{message:'Simulated database outage'}}
      Object.assign(state,patch)
      return {data:{...state},error:null}
    }
    const q={update(value){patch=value;return q},eq(key,value){conditions.push([key,value]);return q},select(){return q},async maybeSingle(){return apply()},async single(){return apply()},then(resolve,reject){return Promise.resolve(apply()).then(resolve,reject)}}
    return q
  }}
}
const options={search,digest,to:'test@example.invalid',origin:'https://aerotrade.app',secret:'test-only-secret'}

test('two concurrent workers produce one provider call and one accepted receipt',async()=>{
  const client=ledger();let calls=0
  const send=async()=>{calls++;await Promise.resolve();return {success:true,resendId:'test-provider-id'}}
  const result=await Promise.all([dispatchPreparedSearchDigest(client,options,send),dispatchPreparedSearchDigest(client,options,send)])
  assert.equal(calls,1)
  assert.deepEqual(result.sort(),['accepted','skipped'])
  assert.equal(client.state.provider_message_id,'test-provider-id')
})

test('provider timeout and acceptance readback failure never reopen a digest for automatic resend',async()=>{
  for(const failure of ['provider','database']) {
    const client=ledger({failReadback:failure==='database'});let calls=0
    const send=async()=>{calls++;if(failure==='provider') throw new Error('timeout');return {success:true,resendId:'accepted-before-db-failure'}}
    assert.equal(await dispatchPreparedSearchDigest(client,options,send),'uncertain')
    assert.equal(await dispatchPreparedSearchDigest(client,options,send),'skipped')
    assert.equal(calls,1)
    assert.notEqual(client.state.status,'prepared')
  }
})
