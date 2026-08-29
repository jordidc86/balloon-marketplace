-- Enable necessary extensions
create extension if not exists "uuid-ossp";

-- 1. USERS TABLE
-- Maps to Supabase auth.users
create table public.users (
  id uuid references auth.users(id) on delete cascade primary key,
  email text unique not null,
  role text default 'user' check (role in ('user', 'admin')),
  stripe_customer_id text,
  stripe_subscription_id text,
  is_premium boolean default false,
  premium_source text check (premium_source in ('stripe', 'admin', 'legacy')),
  premium_granted_by uuid references public.users(id) on delete set null,
  premium_granted_at timestamp with time zone,
  premium_revoked_at timestamp with time zone,
  premium_last_stripe_event_id text,
  name text,
  phone text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. LISTINGS TABLE
create table public.listings (
  id uuid default uuid_generate_v4() primary key,
  seller_id uuid references public.users(id) on delete cascade not null,
  category text not null,
  title text not null,
  description text,
  price numeric not null,
  currency text default 'EUR' not null,
  condition text not null,
  location_country text not null,
  contact_email text not null,
  contact_phone text,

  -- Conditional fields stored as JSONB for flexibility
  details jsonb default '{}'::jsonb,

  -- Status and Time logic
  status text default 'DRAFT' check (status in ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE_PREMIUM', 'ACTIVE_PUBLIC', 'SOLD', 'ARCHIVED', 'FLAGGED')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  public_at timestamp with time zone, -- Will be set to created_at + 48h when payment succeeds
  instagram_posted boolean default false, -- Tracks if listing was posted to Instagram 48h after public_at
  facebook_posted boolean default false, -- Tracks if listing was posted to Facebook 48h after public_at
  social_last_posted_at timestamp with time zone, -- Tracks rotating social promotion recency
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. IMAGES TABLE
create table public.images (
  id uuid default uuid_generate_v4() primary key,
  listing_id uuid references public.listings(id) on delete cascade not null,
  url text not null,
  is_primary boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. LISTING EVENTS TABLE (For intent tracking as planned)
create table public.listing_events (
  id uuid default uuid_generate_v4() primary key,
  listing_id uuid references public.listings(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('VIEW', 'CONTACT_REVEAL')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. NEW BALLOON QUOTE REQUESTS
create table public.quote_requests (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  email text not null,
  phone text,
  country text,
  manufacturer_preference text,
  equipment_type text not null,
  volume_or_capacity text,
  intended_use text,
  budget_range text,
  timeline text,
  colors_or_branding text,
  notes text,
  status text default 'NEW' check (status in ('NEW', 'CONTACTED', 'SENT_TO_PARTNER', 'QUOTE_SENT', 'WON', 'LOST')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. NEWSLETTER DELIVERY AUDIT
create table public.newsletter_runs (
  id uuid default uuid_generate_v4() primary key,
  period_key text not null,
  trigger_source text not null default 'unknown' check (trigger_source in ('schedule', 'manual', 'workflow_dispatch', 'test', 'unknown')),
  status text not null default 'running' check (status in ('running', 'sent', 'partial', 'failed', 'skipped')),
  dry_run boolean not null default false,
  test_email text,
  days_filter integer,
  mix_with_latest boolean not null default false,
  started_at timestamp with time zone default timezone('utc'::text, now()) not null,
  completed_at timestamp with time zone,
  recipients_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_invalid_recipients integer not null default 0,
  listings_count integer not null default 0,
  primary_listing_count integer not null default 0,
  upgraded_expired_premium_listings integer not null default 0,
  would_upgrade_expired_premium_listings integer not null default 0,
  listing_ids uuid[] not null default '{}'::uuid[],
  resend_message_ids text[] not null default '{}'::text[],
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create unique index newsletter_runs_one_live_send_per_period
  on public.newsletter_runs (period_key)
  where dry_run = false
    and test_email is null
    and status in ('running', 'sent', 'partial');

create index newsletter_runs_created_at_idx on public.newsletter_runs (created_at desc);
create index newsletter_runs_status_idx on public.newsletter_runs (status);

create table public.newsletter_recipients (
  id uuid default uuid_generate_v4() primary key,
  run_id uuid references public.newsletter_runs(id) on delete cascade not null,
  email text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  resend_id text,
  error_message text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (run_id, email)
);

create index newsletter_recipients_run_id_idx on public.newsletter_recipients (run_id);
create index newsletter_recipients_status_idx on public.newsletter_recipients (status);

-- 7. PREMIUM ALERT DELIVERY AUDIT
create table public.premium_alert_runs (
  id uuid default uuid_generate_v4() primary key,
  listing_id uuid references public.listings(id) on delete cascade not null,
  status text not null default 'running' check (status in ('running', 'sent', 'partial', 'failed', 'skipped')),
  started_at timestamp with time zone default timezone('utc'::text, now()) not null,
  completed_at timestamp with time zone,
  recipients_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_invalid_recipients integer not null default 0,
  resend_message_ids text[] not null default '{}'::text[],
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create unique index premium_alert_runs_one_success_per_listing
  on public.premium_alert_runs (listing_id)
  where status in ('running', 'sent', 'partial');

create index premium_alert_runs_created_at_idx on public.premium_alert_runs (created_at desc);
create index premium_alert_runs_status_idx on public.premium_alert_runs (status);

create table public.premium_alert_recipients (
  id uuid default uuid_generate_v4() primary key,
  run_id uuid references public.premium_alert_runs(id) on delete cascade not null,
  email text not null,
  status text not null check (status in ('sent', 'failed', 'skipped')),
  resend_id text,
  error_message text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (run_id, email)
);

create table public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  stripe_created_at timestamp with time zone not null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'failed')),
  attempts integer not null default 1,
  last_error text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index stripe_webhook_events_status_idx
  on public.stripe_webhook_events (status, updated_at desc);

create table public.payment_notification_receipts (
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

create index payment_notification_receipts_accepted_at_idx
  on public.payment_notification_receipts (accepted_at desc);

create index premium_alert_recipients_run_id_idx on public.premium_alert_recipients (run_id);
create index premium_alert_recipients_status_idx on public.premium_alert_recipients (status);

-- ROW LEVEL SECURITY (RLS) SETUP

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.listings enable row level security;
alter table public.images enable row level security;
alter table public.listing_events enable row level security;
alter table public.quote_requests enable row level security;
alter table public.newsletter_runs enable row level security;
alter table public.newsletter_recipients enable row level security;
alter table public.premium_alert_runs enable row level security;
alter table public.premium_alert_recipients enable row level security;
alter table public.stripe_webhook_events enable row level security;
alter table public.payment_notification_receipts enable row level security;

revoke all on public.stripe_webhook_events from anon, authenticated;
revoke all on public.payment_notification_receipts from anon, authenticated;

-- USERS Policies
create policy "Users can view their own profile" on public.users for select using (auth.uid() = id);
create policy "Users can update their own basic profile fields" on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.users from anon, authenticated;
grant update (name, phone, updated_at) on public.users to authenticated;

-- LISTINGS Policies (The core business logic)
-- 1. Anyone can see ACTIVE_PUBLIC listings
create policy "Anyone can view public listings" on public.listings for select
  using (status = 'ACTIVE_PUBLIC' and public_at <= now());

-- 2. Premium users can see ACTIVE_PREMIUM listings
create policy "Premium users can view premium listings" on public.listings for select
  using (
    status = 'ACTIVE_PREMIUM' and
    exists (select 1 from public.users where id = auth.uid() and is_premium = true)
  );

-- 3. Sellers can always see and manage their own listings regardless of status
create policy "Sellers can view own listings" on public.listings for select using (auth.uid() = seller_id);
create policy "Sellers can insert own listings" on public.listings for insert with check (auth.uid() = seller_id);
create policy "Sellers can update own listings" on public.listings for update using (auth.uid() = seller_id);
create policy "Sellers can delete own listings" on public.listings for delete using (auth.uid() = seller_id);

-- IMAGES Policies
create policy "Images inherit listing viewing rights (Public)" on public.images for select
  using (exists (select 1 from public.listings where id = listing_id and status = 'ACTIVE_PUBLIC'));

create policy "Images inherit listing viewing rights (Premium)" on public.images for select
  using (
    exists (select 1 from public.listings where id = listing_id and status = 'ACTIVE_PREMIUM') and
    exists (select 1 from public.users where id = auth.uid() and is_premium = true)
  );

create policy "Sellers can manage images of their listings" on public.images for all
  using (exists (select 1 from public.listings where id = listing_id and seller_id = auth.uid()));

-- EVENTS Policies
create policy "Users can insert their own events" on public.listing_events for insert
  with check (auth.uid() = user_id or auth.uid() is null);

-- AUTOMATION / TRIGGERS
-- Auto-create public.users row when auth.users signs up
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name, phone)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

create trigger set_users_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();

create trigger set_newsletter_runs_updated_at
  before update on public.newsletter_runs
  for each row execute procedure public.set_updated_at();

create trigger set_stripe_webhook_events_updated_at
  before update on public.stripe_webhook_events
  for each row execute procedure public.set_updated_at();

create trigger set_newsletter_recipients_updated_at
  before update on public.newsletter_recipients
  for each row execute procedure public.set_updated_at();

create trigger set_premium_alert_runs_updated_at
  before update on public.premium_alert_runs
  for each row execute procedure public.set_updated_at();

create trigger set_premium_alert_recipients_updated_at
  before update on public.premium_alert_recipients
  for each row execute procedure public.set_updated_at();

-- ADMIN POLICIES
-- Give admins full access to all tables so the Admin Panel works
create policy "Admins can do everything on users" on public.users for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Admins can do everything on listings" on public.listings for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Admins can do everything on images" on public.images for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Admins can do everything on listing_events" on public.listing_events for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Admins can do everything on quote_requests" on public.quote_requests for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Admins can do everything on newsletter_runs" on public.newsletter_runs for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Admins can do everything on newsletter_recipients" on public.newsletter_recipients for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Admins can do everything on premium_alert_runs" on public.premium_alert_runs for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create policy "Admins can do everything on premium_alert_recipients" on public.premium_alert_recipients for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

-- 2026-08-29 COMMERCIAL PIPELINE
create table public.marketplace_inquiries (
  id uuid default uuid_generate_v4() primary key,
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_user_id uuid references public.users(id) on delete set null,
  buyer_name text not null check (char_length(buyer_name) between 2 and 120),
  buyer_email text not null check (char_length(buyer_email) between 5 and 320),
  buyer_phone text check (buyer_phone is null or char_length(buyer_phone) <= 60),
  message text not null check (char_length(message) between 20 and 2000),
  source text not null default 'listing_form' check (source in ('listing_form', 'admin', 'import')),
  status text not null default 'NEW' check (status in ('NEW', 'SELLER_NOTIFIED', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'WON', 'LOST', 'SPAM')),
  seller_notification_status text not null default 'pending' check (seller_notification_status in ('pending', 'accepted', 'failed', 'not_required')),
  seller_notification_provider_id text,
  seller_notification_error text,
  last_activity_at timestamp with time zone default timezone('utc'::text, now()) not null,
  closed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index marketplace_inquiries_listing_created_idx on public.marketplace_inquiries (listing_id, created_at desc);
create index marketplace_inquiries_status_activity_idx on public.marketplace_inquiries (status, last_activity_at desc);
create index marketplace_inquiries_buyer_email_idx on public.marketplace_inquiries (lower(buyer_email), created_at desc);
create trigger set_marketplace_inquiries_updated_at before update on public.marketplace_inquiries for each row execute procedure public.set_updated_at();
alter table public.marketplace_inquiries enable row level security;
revoke all on public.marketplace_inquiries from anon, authenticated;
grant select on public.marketplace_inquiries to authenticated;
grant update (status, last_activity_at, closed_at, updated_at) on public.marketplace_inquiries to authenticated;
create policy "Sellers can view enquiries for their listings" on public.marketplace_inquiries for select to authenticated
  using (exists (select 1 from public.listings where listings.id = marketplace_inquiries.listing_id and listings.seller_id = auth.uid()));
create policy "Sellers can update enquiries for their listings" on public.marketplace_inquiries for update to authenticated
  using (exists (select 1 from public.listings where listings.id = marketplace_inquiries.listing_id and listings.seller_id = auth.uid()))
  with check (exists (select 1 from public.listings where listings.id = marketplace_inquiries.listing_id and listings.seller_id = auth.uid()));
create policy "Admins can manage marketplace enquiries" on public.marketplace_inquiries for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create table public.listing_verifications (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  status text not null default 'UNVERIFIED' check (status in ('UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED')),
  identity_checked boolean not null default false,
  supporting_documents_checked boolean not null default false,
  public_summary text not null default 'Seller identity and supporting listing evidence reviewed by AeroTrade. This is not an airworthiness inspection.' check (char_length(public_summary) between 20 and 500),
  verified_by uuid references public.users(id) on delete set null,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create trigger set_listing_verifications_updated_at before update on public.listing_verifications for each row execute procedure public.set_updated_at();
alter table public.listing_verifications enable row level security;
revoke all on public.listing_verifications from anon, authenticated;
grant select on public.listing_verifications to authenticated;
create policy "Sellers can view verification for their listings" on public.listing_verifications for select to authenticated
  using (exists (select 1 from public.listings where listings.id = listing_verifications.listing_id and listings.seller_id = auth.uid()));
create policy "Admins can manage listing verification" on public.listing_verifications for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

alter table public.listing_events
  add column event_key text,
  add column referrer_host text,
  add column utm_source text,
  add column utm_medium text,
  add column utm_campaign text,
  add constraint listing_events_event_key_length check (event_key is null or char_length(event_key) = 64),
  add constraint listing_events_referrer_host_length check (referrer_host is null or char_length(referrer_host) <= 255),
  add constraint listing_events_utm_source_length check (utm_source is null or char_length(utm_source) <= 120),
  add constraint listing_events_utm_medium_length check (utm_medium is null or char_length(utm_medium) <= 120),
  add constraint listing_events_utm_campaign_length check (utm_campaign is null or char_length(utm_campaign) <= 120);
create unique index listing_events_event_key_unique on public.listing_events (event_key) where event_key is not null;
create index listing_events_attribution_idx on public.listing_events (utm_source, event_type, created_at desc);

create table public.commercial_notification_receipts (
  id uuid default uuid_generate_v4() primary key,
  notification_type text not null check (notification_type in ('listing_created_admin', 'quote_created_admin')),
  entity_type text not null check (entity_type in ('listing', 'quote_request')),
  entity_id uuid not null,
  recipient_role text not null default 'admin' check (recipient_role in ('admin', 'seller')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'failed')),
  provider_message_id text,
  error_message text,
  idempotency_key text not null unique,
  attempted_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);
create index commercial_notification_receipts_entity_idx on public.commercial_notification_receipts (entity_type, entity_id, created_at desc);
create index commercial_notification_receipts_attention_idx on public.commercial_notification_receipts (status, created_at desc);
create trigger set_commercial_notification_receipts_updated_at before update on public.commercial_notification_receipts for each row execute procedure public.set_updated_at();
alter table public.commercial_notification_receipts enable row level security;
revoke all on public.commercial_notification_receipts from anon, authenticated;
create policy "Admins can manage commercial notification receipts" on public.commercial_notification_receipts for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

create table public.commercial_outcomes (
  id uuid default uuid_generate_v4() primary key,
  entity_type text not null check (entity_type in ('marketplace_inquiry', 'quote_request')),
  entity_id uuid not null,
  outcome_type text not null default 'sale' check (outcome_type in ('sale', 'intermediation', 'other')),
  currency text not null default 'EUR' check (currency in ('EUR', 'GBP', 'USD')),
  gross_amount_minor bigint not null default 0 check (gross_amount_minor >= 0),
  aerotrade_revenue_minor bigint not null default 0 check (aerotrade_revenue_minor >= 0 and aerotrade_revenue_minor <= gross_amount_minor),
  evidence_level text not null default 'reported' check (evidence_level in ('reported', 'documented', 'settled')),
  notes text check (notes is null or char_length(notes) <= 2000),
  recorded_by uuid references public.users(id) on delete set null,
  closed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (entity_type, entity_id)
);
create index commercial_outcomes_evidence_closed_idx on public.commercial_outcomes (evidence_level, closed_at desc);
create trigger set_commercial_outcomes_updated_at before update on public.commercial_outcomes for each row execute procedure public.set_updated_at();
alter table public.commercial_outcomes enable row level security;
revoke all on public.commercial_outcomes from anon, authenticated;
create policy "Admins can manage commercial outcomes" on public.commercial_outcomes for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));
