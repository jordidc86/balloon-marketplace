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
  status text not null default 'running' check (status in ('running', 'sent', 'failed', 'skipped')),
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
    and status in ('running', 'sent');

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
  status text not null default 'running' check (status in ('running', 'sent', 'failed', 'skipped')),
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
  where status in ('running', 'sent');

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

revoke all on public.stripe_webhook_events from anon, authenticated;

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
