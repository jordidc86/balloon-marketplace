create table if not exists public.payment_notification_receipts (
  charge_id text primary key,
  stripe_event_id text not null unique references public.stripe_webhook_events(event_id) on delete restrict,
  payment_intent_id text,
  invoice_id text,
  subscription_id text,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  payment_type text not null check (payment_type in ('listing_fee', 'premium_subscription', 'other')),
  product_label text not null check (char_length(product_label) between 1 and 500),
  livemode boolean not null,
  provider_message_id text not null unique check (char_length(provider_message_id) between 1 and 255),
  accepted_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists payment_notification_receipts_accepted_at_idx
  on public.payment_notification_receipts (accepted_at desc);

alter table public.payment_notification_receipts enable row level security;

revoke all on public.payment_notification_receipts from anon, authenticated;
