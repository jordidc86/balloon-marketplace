-- Permit one provider-audited, non-promotional preference invitation per
-- existing non-admin account. Opening the link is read-only; only an explicit
-- POST confirmation can change NOT_REQUESTED to ACTIVE.

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check check (notification_type in (
    'listing_created_admin','quote_created_admin','wanted_request_admin','listing_quality_quarantine','inquiry_buyer_ack',
    'inquiry_seller_followup','inquiry_seller_escalation','inquiry_buyer_seller_response','inquiry_seller_buyer_response','quote_admin_followup','premium_listing_checkout_recovery',
    'wanted_match_buyer','listing_verification_requested','listing_verification_decision','seller_assistance_created_admin',
    'seller_assistance_admin_followup','new_balloon_proposal_buyer','new_balloon_buyer_ack','listing_watch_confirmation','listing_watch_update',
    'listing_availability_request','new_balloon_proposal_response_admin','new_balloon_proposal_response_followup',
    'buyer_early_access_checkout_recovery','seller_availability_digest','newsletter_consent_invitation'
  ));

comment on constraint commercial_notification_receipts_notification_type_check on public.commercial_notification_receipts is
  'Closed delivery vocabulary. newsletter_consent_invitation is a single optional-preference request; it contains no listings and does not activate consent on delivery or link open.';
