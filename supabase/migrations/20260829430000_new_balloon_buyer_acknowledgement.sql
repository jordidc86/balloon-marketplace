alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check check (notification_type in (
    'listing_created_admin','quote_created_admin','wanted_request_admin','listing_quality_quarantine','inquiry_buyer_ack',
    'inquiry_seller_followup','inquiry_buyer_seller_response','inquiry_seller_buyer_response','quote_admin_followup','premium_listing_checkout_recovery',
    'wanted_match_buyer','listing_verification_requested','listing_verification_decision','seller_assistance_created_admin',
    'seller_assistance_admin_followup','new_balloon_proposal_buyer','new_balloon_buyer_ack','listing_watch_confirmation','listing_watch_update'
  ));

comment on constraint commercial_notification_receipts_notification_type_check on public.commercial_notification_receipts is
  'Closed vocabulary for transactional commercial delivery receipts. new_balloon_buyer_ack confirms a stored request only; it is not a quotation, order or marketing subscription.';
