import test from 'node:test'
import assert from 'node:assert/strict'
import { selectNewsletterRenewalRecipients, buildNewsletterRenewal } from '../src/utils/newsletter-renewal.mjs'
import { signNewsletterConsentInvitationCapability, verifyNewsletterConsentInvitationCapability, newsletterConsentInvitationReceiptKey } from '../src/utils/newsletter-consent.mjs'
const id='11111111-1111-4111-8111-111111111111'
const secret='a-realistic-local-test-secret-at-least-20-characters'
const now=Date.now()
test('renewal signatures cannot be replayed under another campaign or a legacy receipt',()=>{
 const data={userId:id,email:'pilot@balloon.org',campaign:'2026-10-28',expiresAt:now+86400000,secret}
 const token=signNewsletterConsentInvitationCapability(data)
 assert.equal(verifyNewsletterConsentInvitationCapability({...data,token,now}),true)
 assert.equal(verifyNewsletterConsentInvitationCapability({...data,token,now,campaign:''}),false)
 assert.equal(verifyNewsletterConsentInvitationCapability({...data,token,now,campaign:'2026-10-29'}),false)
 assert.equal(newsletterConsentInvitationReceiptKey(id),`newsletter-consent-invitation-v1-${id}`)
 assert.notEqual(newsletterConsentInvitationReceiptKey(id,data.campaign),newsletterConsentInvitationReceiptKey(id))
 assert.equal(newsletterConsentInvitationReceiptKey(id,'bad'),null)
})
test('renewal excludes active, unsubscribed, excluded, admin, public preferences and reserved emails; deduplicates',()=>{
 const user=(id,email,extra={})=>({id,email,role:'user',newsletter_consent_status:'NOT_REQUESTED',...extra})
 const selected=selectNewsletterRenewalRecipients({users:[
  user('a','eligible@balloon.org'),user('b','ELIGIBLE@balloon.org'),user('c','active@balloon.org',{newsletter_consent_status:'ACTIVE'}),user('d','out@balloon.org',{newsletter_consent_status:'UNSUBSCRIBED'}),user('e','excluded@balloon.org'),user('f','admin@balloon.org',{role:'admin'}),user('g','public@balloon.org'),user('h','publicout@balloon.org'),user('i','test@example.com'),user('j','inconsistent@balloon.org',{newsletter_unsubscribed_at:'2026-01-01'})
 ],publicSubscriptions:[{email:'public@balloon.org',status:'ACTIVE',confirmed_at:'2026-01-01'},{email:'publicout@balloon.org',status:'UNSUBSCRIBED'}],exclusions:[{user_id:'e'}]})
 assert.deepEqual(selected,[{id:'a',email:'eligible@balloon.org'}])
})
test('English renewal email points to the correct signed account flow and does not assert subscription',()=>{
 const result=buildNewsletterRenewal({id,email:'pilot@balloon.org',campaign:'2026-10-28',expiresAt:now+86400000,secret})
 assert.match(result.html,/Opening the link does not subscribe you/)
 assert.match(result.html,/no action is needed/)
 assert.match(result.html,/campaign=2026-10-28/)
 assert.match(result.html,/at most twice a month/)
 assert.match(result.subject,/please confirm your preference/)
 assert.throws(()=>buildNewsletterRenewal({id,email:'x@example.com',campaign:'2026-10-28',expiresAt:now+86400000,secret}))
})
