-- Durable, private buyer alerts when active inventory satisfies a consented
-- wanted-equipment request. A dispatch contains only internal UUIDs and provider
-- evidence; the buyer email and request details remain in wanted_requests.

create table if not exists public.wanted_match_dispatches (
  id uuid default uuid_generate_v4() primary key,
  wanted_request_id uuid not null references public.wanted_requests(id) on delete cascade,
  listing_ids uuid[] not null,
  match_fingerprint text not null unique check (char_length(match_fingerprint) = 64),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'FAILED', 'CANCELLED')),
  provider_message_id text,
  attempted_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint wanted_match_dispatches_listing_count check (
    cardinality(listing_ids) between 1 and 5
  )
);

create index if not exists wanted_match_dispatches_request_status_idx
  on public.wanted_match_dispatches (wanted_request_id, status, updated_at desc);

drop trigger if exists set_wanted_match_dispatches_updated_at on public.wanted_match_dispatches;
create trigger set_wanted_match_dispatches_updated_at
  before update on public.wanted_match_dispatches
  for each row execute procedure public.set_updated_at();

alter table public.wanted_match_dispatches enable row level security;
revoke all on public.wanted_match_dispatches from anon, authenticated;

drop policy if exists "Admins can manage wanted match dispatches" on public.wanted_match_dispatches;
create policy "Admins can manage wanted match dispatches"
  on public.wanted_match_dispatches for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

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
      'premium_listing_checkout_recovery',
      'wanted_match_buyer'
    ));
