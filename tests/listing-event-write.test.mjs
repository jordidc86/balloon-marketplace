import test from 'node:test'
import assert from 'node:assert/strict'
import { insertListingEventOnce } from '../src/utils/listing-event-write.mjs'
const event={event_key:'a'.repeat(64),event_type:'CONTACT_REVEAL'}
function db(error){return {from:table=>{assert.equal(table,'listing_events');return {insert:row=>{assert.equal(row,event);return {error}}}}}}
test('first listing event is inserted without an unsupported conflict target',async()=>{
 assert.equal((await insertListingEventOnce(db(null),event)).error,null)
})
test('daily duplicate event is harmless but unrelated uniqueness and database failures remain visible',async()=>{
 const duplicate={code:'23505',message:'duplicate key value violates unique constraint "listing_events_event_key_unique"'}
 assert.equal((await insertListingEventOnce(db(duplicate),event)).error,null)
 for(const error of [{code:'23505',message:'duplicate key violates listing_events_pkey'},{code:'42P10',message:'no unique constraint'},{code:'42501',message:'permission denied'}]){
  assert.equal((await insertListingEventOnce(db(error),event)).error,error)
 }
})
