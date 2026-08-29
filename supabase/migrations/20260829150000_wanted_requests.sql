-- Durable buyer-demand capture for equipment not currently available in the catalog.
-- Private by default: public submissions go through a validated server action.

create table if not exists public.wanted_requests (
  id uuid default uuid_generate_v4() primary key,
  buyer_user_id uuid references public.users(id) on delete set null,
  buyer_name text not null check (char_length(buyer_name) between 2 and 120),
  buyer_email text not null check (char_length(buyer_email) between 5 and 320),
  buyer_phone text check (buyer_phone is null or char_length(buyer_phone) <= 60),
  category text not null check (category in ('complete', 'envelopes', 'baskets', 'burners', 'bottom-end', 'cylinders', 'other-equipment')),
  location_preference text check (location_preference is null or char_length(location_preference) <= 120),
  currency text not null default 'EUR' check (currency in ('EUR', 'GBP', 'USD')),
  budget_min_minor bigint check (budget_min_minor is null or budget_min_minor >= 0),
  budget_max_minor bigint check (budget_max_minor is null or budget_max_minor >= 0),
  details text not null check (char_length(details) between 20 and 3000),
  notify_on_match boolean not null default false,
  privacy_consent_at timestamp with time zone not null default timezone('utc'::text, now()),
  source text not null default 'wanted_form' check (source in ('wanted_form', 'admin')),
  submission_key text check (submission_key is null or char_length(submission_key) = 64),
  status text not null default 'NEW' check (status in ('NEW', 'REVIEWING', 'MATCHED', 'CONTACTED', 'CLOSED', 'SPAM')),
  last_activity_at timestamp with time zone not null default timezone('utc'::text, now()),
  closed_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint wanted_requests_budget_order check (
    budget_min_minor is null or budget_max_minor is null or budget_min_minor <= budget_max_minor
  )
);

create index if not exists wanted_requests_status_created_idx
  on public.wanted_requests (status, created_at desc);
create index if not exists wanted_requests_match_idx
  on public.wanted_requests (category, currency, budget_max_minor, created_at desc)
  where status not in ('CLOSED', 'SPAM');
create index if not exists wanted_requests_buyer_dedup_idx
  on public.wanted_requests (lower(buyer_email), category, created_at desc);
create index if not exists wanted_requests_submission_rate_idx
  on public.wanted_requests (submission_key, created_at desc)
  where submission_key is not null;

drop trigger if exists set_wanted_requests_updated_at on public.wanted_requests;
create trigger set_wanted_requests_updated_at
  before update on public.wanted_requests
  for each row execute procedure public.set_updated_at();

alter table public.wanted_requests enable row level security;
revoke all on public.wanted_requests from anon, authenticated;

drop policy if exists "Admins can manage wanted requests" on public.wanted_requests;
create policy "Admins can manage wanted requests"
  on public.wanted_requests for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check,
  drop constraint if exists commercial_notification_receipts_entity_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check
    check (notification_type in ('listing_created_admin', 'quote_created_admin', 'wanted_request_admin')),
  add constraint commercial_notification_receipts_entity_type_check
    check (entity_type in ('listing', 'quote_request', 'wanted_request'));
