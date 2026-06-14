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

create trigger set_newsletter_runs_updated_at
  before update on public.newsletter_runs
  for each row execute procedure public.set_updated_at();

alter table public.newsletter_runs enable row level security;

create policy "Admins can do everything on newsletter_runs" on public.newsletter_runs for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

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

create trigger set_newsletter_recipients_updated_at
  before update on public.newsletter_recipients
  for each row execute procedure public.set_updated_at();

alter table public.newsletter_recipients enable row level security;

create policy "Admins can do everything on newsletter_recipients" on public.newsletter_recipients for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

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

create trigger set_premium_alert_runs_updated_at
  before update on public.premium_alert_runs
  for each row execute procedure public.set_updated_at();

alter table public.premium_alert_runs enable row level security;

create policy "Admins can do everything on premium_alert_runs" on public.premium_alert_runs for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

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

create index premium_alert_recipients_run_id_idx on public.premium_alert_recipients (run_id);
create index premium_alert_recipients_status_idx on public.premium_alert_recipients (status);

create trigger set_premium_alert_recipients_updated_at
  before update on public.premium_alert_recipients
  for each row execute procedure public.set_updated_at();

alter table public.premium_alert_recipients enable row level security;

create policy "Admins can do everything on premium_alert_recipients" on public.premium_alert_recipients for all
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));
