-- Aggregate demand measurement for catalog searches and zero-result supply gaps.
-- Private and deduplicated; no raw visitor identifier is stored.

create table if not exists public.catalog_search_events (
  id uuid default uuid_generate_v4() primary key,
  event_key text not null unique check (char_length(event_key) = 64),
  query_text text check (query_text is null or char_length(query_text) <= 120),
  category text check (category is null or category in ('complete', 'envelopes', 'baskets', 'burners', 'bottom-end', 'cylinders', 'other-equipment')),
  country text check (country is null or char_length(country) <= 100),
  sort text not null default 'newest' check (sort in ('newest', 'price_asc', 'price_desc')),
  result_count integer not null check (result_count between 0 and 10000),
  zero_results boolean not null,
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 255),
  utm_source text check (utm_source is null or char_length(utm_source) <= 120),
  utm_medium text check (utm_medium is null or char_length(utm_medium) <= 120),
  utm_campaign text check (utm_campaign is null or char_length(utm_campaign) <= 120),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint catalog_search_zero_result_consistency check (zero_results = (result_count = 0))
);

create index if not exists catalog_search_zero_demand_idx
  on public.catalog_search_events (zero_results, category, created_at desc);
create index if not exists catalog_search_source_idx
  on public.catalog_search_events (utm_source, created_at desc);

alter table public.catalog_search_events enable row level security;
revoke all on public.catalog_search_events from anon, authenticated;

drop policy if exists "Admins can read catalog search demand" on public.catalog_search_events;
create policy "Admins can read catalog search demand"
  on public.catalog_search_events for select to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));
