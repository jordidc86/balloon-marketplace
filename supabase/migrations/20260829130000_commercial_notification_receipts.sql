-- Durable evidence for operational commercial emails that are not already
-- represented by a dedicated delivery ledger. This table contains no message
-- bodies and is private to administrators.
create table if not exists public.commercial_notification_receipts (
  id uuid default uuid_generate_v4() primary key,
  notification_type text not null
    check (notification_type in ('listing_created_admin', 'quote_created_admin')),
  entity_type text not null
    check (entity_type in ('listing', 'quote_request')),
  entity_id uuid not null,
  recipient_role text not null default 'admin'
    check (recipient_role in ('admin', 'seller')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'failed')),
  provider_message_id text,
  error_message text,
  idempotency_key text not null unique,
  attempted_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists commercial_notification_receipts_entity_idx
  on public.commercial_notification_receipts (entity_type, entity_id, created_at desc);

create index if not exists commercial_notification_receipts_attention_idx
  on public.commercial_notification_receipts (status, created_at desc);

drop trigger if exists set_commercial_notification_receipts_updated_at on public.commercial_notification_receipts;
create trigger set_commercial_notification_receipts_updated_at
  before update on public.commercial_notification_receipts
  for each row execute procedure public.set_updated_at();

alter table public.commercial_notification_receipts enable row level security;
revoke all on public.commercial_notification_receipts from anon, authenticated;

drop policy if exists "Admins can manage commercial notification receipts" on public.commercial_notification_receipts;
create policy "Admins can manage commercial notification receipts"
  on public.commercial_notification_receipts for all
  to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));
