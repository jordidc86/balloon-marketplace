-- Add one-time, evidence-backed recovery for Premium listing checkouts that
-- remain unpublished. The receipt stores no message body, email address,
-- checkout URL or payment data.
alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check
    check (notification_type in (
      'listing_created_admin',
      'quote_created_admin',
      'wanted_request_admin',
      'listing_quality_quarantine',
      'inquiry_buyer_ack',
      'inquiry_seller_followup',
      'quote_admin_followup',
      'premium_listing_checkout_recovery'
    ));

alter table public.seller_funnel_events
  drop constraint if exists seller_funnel_events_stage_check,
  drop constraint if exists seller_funnel_listing_stage_consistency;

alter table public.seller_funnel_events
  add constraint seller_funnel_events_stage_check
    check (stage in (
      'SELL_PAGE_VIEWED',
      'FORM_STARTED',
      'LISTING_SUBMITTED',
      'CHECKOUT_CREATED',
      'CHECKOUT_RECOVERY_SENT',
      'CHECKOUT_RESUMED',
      'PAYMENT_CONFIRMED',
      'LISTING_PUBLISHED'
    )),
  add constraint seller_funnel_listing_stage_consistency check (
    (stage in ('SELL_PAGE_VIEWED', 'FORM_STARTED') and listing_id is null)
    or (
      stage in (
        'LISTING_SUBMITTED',
        'CHECKOUT_CREATED',
        'CHECKOUT_RECOVERY_SENT',
        'CHECKOUT_RESUMED',
        'PAYMENT_CONFIRMED',
        'LISTING_PUBLISHED'
      )
      and listing_id is not null
    )
  );
