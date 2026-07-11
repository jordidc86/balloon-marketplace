create table if not exists public.stripe_webhook_events (
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

create index if not exists stripe_webhook_events_status_idx
  on public.stripe_webhook_events (status, updated_at desc);

alter table public.stripe_webhook_events enable row level security;

revoke all on public.stripe_webhook_events from anon, authenticated;

drop trigger if exists set_stripe_webhook_events_updated_at on public.stripe_webhook_events;
create trigger set_stripe_webhook_events_updated_at
  before update on public.stripe_webhook_events
  for each row execute procedure public.set_updated_at();
