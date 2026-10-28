import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transpileModule, ModuleKind } from 'typescript'
import { newsletterConsentInvitationReceiptKey, signNewsletterConsentInvitationCapability } from '../src/utils/newsletter-consent.mjs'

test('account confirmation requires a matching accepted campaign receipt and signature before activation',async()=>{
 const id='11111111-1111-4111-8111-111111111111',email='pilot@balloon.org',secret='test-only-newsletter-action-secret-12345'
 const previous=process.env.SUPABASE_SERVICE_ROLE_KEY;process.env.SUPABASE_SERVICE_ROLE_KEY=secret
 let updates=0,receiptKey=''
 globalThis.__renewalTestDb={from(table){let filters={};return{select(){return this},eq(k,v){filters[k]=v;return this},update(){updates++;return this},async maybeSingle(){return{data:table==='users'?{id,email,role:'user',newsletter_consent_status:'NOT_REQUESTED'}:filters.idempotency_key===receiptKey?{status:'accepted',provider_message_id:'provider-id'}:null,error:null}},async single(){return{data:{newsletter_consent_status:'ACTIVE',newsletter_consented_at:new Date().toISOString()},error:null}}}}}
 try{
  const stub='data:text/javascript;base64,'+Buffer.from('export const revalidatePath=()=>{};export const createAdminClient=async()=>globalThis.__renewalTestDb;').toString('base64')
  let source=await readFile(new URL('../src/app/newsletter/subscribe/actions.ts',import.meta.url),'utf8')
  for(const name of ['next/cache','@/utils/supabase/server'])source=source.replace(`'${name}'`,`'${stub}'`)
  source=source.replaceAll('@/utils/',new URL('../src/utils/',import.meta.url).href)
  const actionsModule=await import('data:text/javascript;base64,'+Buffer.from(transpileModule(source,{compilerOptions:{module:ModuleKind.ESNext}}).outputText).toString('base64'))
  for(const campaign of ['', '2026-10-28']){
   const expiresAt=Date.now()+86400000,token=signNewsletterConsentInvitationCapability({userId:id,email,expiresAt,campaign,secret})
   const form=new FormData();for(const[k,v]of Object.entries({id,expires:String(expiresAt),token,campaign}))form.set(k,v)
   receiptKey=newsletterConsentInvitationReceiptKey(id,campaign)
   const before=updates;assert.equal((await actionsModule.confirmNewsletterConsent({success:false,message:''},form)).success,true);assert.equal(updates,before+1)
   form.set('campaign','2026-10-29');assert.equal((await actionsModule.confirmNewsletterConsent({success:false,message:''},form)).success,false);assert.equal(updates,before+1)
  }
 }finally{delete globalThis.__renewalTestDb;if(previous===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=previous}
})
