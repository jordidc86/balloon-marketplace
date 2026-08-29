-- Extend the private operational receipt ledger for buyer acknowledgements and
-- one-time opportunity follow-ups. No message body or recipient address is stored.
alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check,
  drop constraint if exists commercial_notification_receipts_entity_type_check,
  drop constraint if exists commercial_notification_receipts_recipient_role_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check
    check (notification_type in (
      'listing_created_admin',
      'quote_created_admin',
      'wanted_request_admin',
      'listing_quality_quarantine',
      'inquiry_buyer_ack',
      'inquiry_seller_followup',
      'quote_admin_followup'
    )),
  add constraint commercial_notification_receipts_entity_type_check
    check (entity_type in ('listing', 'quote_request', 'wanted_request', 'inquiry')),
  add constraint commercial_notification_receipts_recipient_role_check
    check (recipient_role in ('admin', 'seller', 'buyer'));
