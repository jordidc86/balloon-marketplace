alter table public.seller_funnel_events
  add column if not exists channel text;

alter table public.seller_funnel_events
  drop constraint if exists seller_funnel_events_stage_check,
  drop constraint if exists seller_funnel_listing_stage_consistency,
  drop constraint if exists seller_funnel_events_channel_check;

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
      'LISTING_PUBLISHED',
      'LISTING_SHARED'
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
        'LISTING_PUBLISHED',
        'LISTING_SHARED'
      )
      and listing_id is not null
    )
  ),
  add constraint seller_funnel_events_channel_check check (
    (stage = 'LISTING_SHARED' and channel in ('native', 'whatsapp', 'email', 'copy', 'linkedin', 'facebook'))
    or (stage <> 'LISTING_SHARED' and channel is null)
  );

create index if not exists seller_funnel_listing_share_channel_idx
  on public.seller_funnel_events (channel, created_at desc)
  where stage = 'LISTING_SHARED';

comment on column public.seller_funnel_events.channel is
  'Closed distribution channel for an authenticated seller share action. It stores no destination, recipient, message body or buyer identifier.';

