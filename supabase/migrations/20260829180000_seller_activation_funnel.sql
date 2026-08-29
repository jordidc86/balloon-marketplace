-- Private, deduplicated evidence for seller onboarding and listing activation.
-- No password, payment data, free text, IP address or browser identifier is stored.

create table if not exists public.seller_funnel_events (
  id uuid default uuid_generate_v4() primary key,
  event_key text not null unique check (char_length(event_key) = 64),
  seller_id uuid not null references public.users(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  stage text not null check (stage in ('SELL_PAGE_VIEWED', 'FORM_STARTED', 'LISTING_SUBMITTED', 'CHECKOUT_CREATED', 'CHECKOUT_RESUMED', 'PAYMENT_CONFIRMED', 'LISTING_PUBLISHED')),
  listing_plan text check (listing_plan is null or listing_plan in ('free', 'premium')),
  source text not null default 'web' check (source in ('web', 'stripe', 'recovery')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint seller_funnel_listing_stage_consistency check (
    (stage in ('SELL_PAGE_VIEWED', 'FORM_STARTED') and listing_id is null)
    or (stage in ('LISTING_SUBMITTED', 'CHECKOUT_CREATED', 'CHECKOUT_RESUMED', 'PAYMENT_CONFIRMED', 'LISTING_PUBLISHED') and listing_id is not null)
  )
);

create index if not exists seller_funnel_stage_created_idx
  on public.seller_funnel_events (stage, created_at desc);
create index if not exists seller_funnel_seller_created_idx
  on public.seller_funnel_events (seller_id, created_at desc);
create index if not exists seller_funnel_listing_created_idx
  on public.seller_funnel_events (listing_id, created_at desc) where listing_id is not null;

alter table public.seller_funnel_events enable row level security;
revoke all on public.seller_funnel_events from anon, authenticated;

drop policy if exists "Admins can read seller funnel" on public.seller_funnel_events;
create policy "Admins can read seller funnel"
  on public.seller_funnel_events for select to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));
