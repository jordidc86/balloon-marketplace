-- Durable commercial pipeline for buyer enquiries. PII stays private: only the
-- seller owning the listing and administrators may read or update a lead.
create table if not exists public.marketplace_inquiries (
  id uuid default uuid_generate_v4() primary key,
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_user_id uuid references public.users(id) on delete set null,
  buyer_name text not null check (char_length(buyer_name) between 2 and 120),
  buyer_email text not null check (char_length(buyer_email) between 5 and 320),
  buyer_phone text check (buyer_phone is null or char_length(buyer_phone) <= 60),
  message text not null check (char_length(message) between 20 and 2000),
  source text not null default 'listing_form'
    check (source in ('listing_form', 'admin', 'import')),
  status text not null default 'NEW'
    check (status in ('NEW', 'SELLER_NOTIFIED', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'WON', 'LOST', 'SPAM')),
  seller_notification_status text not null default 'pending'
    check (seller_notification_status in ('pending', 'accepted', 'failed', 'not_required')),
  seller_notification_provider_id text,
  seller_notification_error text,
  last_activity_at timestamp with time zone default timezone('utc'::text, now()) not null,
  closed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists marketplace_inquiries_listing_created_idx
  on public.marketplace_inquiries (listing_id, created_at desc);

create index if not exists marketplace_inquiries_status_activity_idx
  on public.marketplace_inquiries (status, last_activity_at desc);

create index if not exists marketplace_inquiries_buyer_email_idx
  on public.marketplace_inquiries (lower(buyer_email), created_at desc);

drop trigger if exists set_marketplace_inquiries_updated_at on public.marketplace_inquiries;
create trigger set_marketplace_inquiries_updated_at
  before update on public.marketplace_inquiries
  for each row execute procedure public.set_updated_at();

alter table public.marketplace_inquiries enable row level security;
revoke all on public.marketplace_inquiries from anon;
revoke all on public.marketplace_inquiries from authenticated;
grant select on public.marketplace_inquiries to authenticated;
grant update (status, last_activity_at, closed_at, updated_at) on public.marketplace_inquiries to authenticated;

drop policy if exists "Sellers can view enquiries for their listings" on public.marketplace_inquiries;
create policy "Sellers can view enquiries for their listings"
  on public.marketplace_inquiries for select
  to authenticated
  using (
    exists (
      select 1 from public.listings
      where listings.id = marketplace_inquiries.listing_id
        and listings.seller_id = auth.uid()
    )
  );

drop policy if exists "Sellers can update enquiries for their listings" on public.marketplace_inquiries;
create policy "Sellers can update enquiries for their listings"
  on public.marketplace_inquiries for update
  to authenticated
  using (
    exists (
      select 1 from public.listings
      where listings.id = marketplace_inquiries.listing_id
        and listings.seller_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.listings
      where listings.id = marketplace_inquiries.listing_id
        and listings.seller_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage marketplace enquiries" on public.marketplace_inquiries;
create policy "Admins can manage marketplace enquiries"
  on public.marketplace_inquiries for all
  to authenticated
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );
