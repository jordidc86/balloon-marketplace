-- Trust evidence is separate from seller-authored listing content. A verified
-- badge means AeroTrade reviewed the identity and supporting listing evidence;
-- it never represents airworthiness, legal title, maintenance release or an
-- independent physical inspection.
create table if not exists public.listing_verifications (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  status text not null default 'UNVERIFIED'
    check (status in ('UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED')),
  identity_checked boolean not null default false,
  supporting_documents_checked boolean not null default false,
  public_summary text not null default 'Seller identity and supporting listing evidence reviewed by AeroTrade. This is not an airworthiness inspection.'
    check (char_length(public_summary) between 20 and 500),
  verified_by uuid references public.users(id) on delete set null,
  verified_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

drop trigger if exists set_listing_verifications_updated_at on public.listing_verifications;
create trigger set_listing_verifications_updated_at
  before update on public.listing_verifications
  for each row execute procedure public.set_updated_at();

alter table public.listing_verifications enable row level security;
revoke all on public.listing_verifications from anon, authenticated;
grant select on public.listing_verifications to authenticated;

drop policy if exists "Sellers can view verification for their listings" on public.listing_verifications;
create policy "Sellers can view verification for their listings"
  on public.listing_verifications for select
  to authenticated
  using (
    exists (
      select 1 from public.listings
      where listings.id = listing_verifications.listing_id
        and listings.seller_id = auth.uid()
    )
  );

drop policy if exists "Admins can manage listing verification" on public.listing_verifications;
create policy "Admins can manage listing verification"
  on public.listing_verifications for all
  to authenticated
  using (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.users where id = auth.uid() and role = 'admin')
  );
