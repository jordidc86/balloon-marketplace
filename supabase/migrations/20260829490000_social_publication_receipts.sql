-- One private receipt per scheduled content/network/placement. A provider-accepted
-- publication is terminal. An interrupted claim remains pending so a scheduler
-- retry cannot accidentally create a duplicate social post.
create table if not exists public.social_publication_receipts (
  id uuid primary key default gen_random_uuid(),
  publication_key text not null unique
    check (publication_key ~ '^social:v1:[0-9]{4}-[0-9]{2}-[0-9]{2}:(listing|brand):[a-z0-9][a-z0-9-]{0,95}:(instagram|facebook):(post|story|carousel|reel|video)$'),
  run_date date not null,
  content_kind text not null check (content_kind in ('listing', 'brand')),
  content_id text not null check (content_id ~ '^[a-z0-9][a-z0-9-]{0,95}$'),
  content_variant text not null check (content_variant ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  network text not null check (network in ('instagram', 'facebook')),
  placement text not null check (placement in ('post', 'story', 'carousel', 'reel', 'video')),
  destination_url text not null check (destination_url ~ '^https://'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 2),
  retryable boolean not null default false,
  provider_id text check (provider_id is null or char_length(provider_id) between 1 and 255),
  error_category text check (error_category is null or error_category in ('token_expired', 'permission', 'configuration', 'timeout', 'rate_limit', 'transient', 'unknown')),
  error_detail text check (error_detail is null or char_length(error_detail) <= 500),
  claimed_at timestamp with time zone,
  next_attempt_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint social_publication_receipts_state_consistency check (
    (status = 'pending' and provider_id is null and accepted_at is null and error_category is null and error_detail is null)
    or (status = 'accepted' and provider_id is not null and accepted_at is not null and retryable = false and next_attempt_at is null and error_category is null and error_detail is null)
    or (status = 'failed' and provider_id is null and accepted_at is null and error_category is not null)
  ),
  constraint social_publication_receipts_retry_consistency check (
    (retryable = false and next_attempt_at is null)
    or (retryable = true and status = 'failed' and attempt_count < 2 and next_attempt_at is not null)
  )
);

create index if not exists social_publication_receipts_run_idx
  on public.social_publication_receipts (run_date desc, network, placement);

create index if not exists social_publication_receipts_attention_idx
  on public.social_publication_receipts (next_attempt_at, updated_at)
  where status in ('pending', 'failed');

alter table public.social_publication_receipts enable row level security;
revoke all on public.social_publication_receipts from public, anon, authenticated;
grant select on public.social_publication_receipts to authenticated;

drop policy if exists "Admins can read social publication receipts" on public.social_publication_receipts;
create policy "Admins can read social publication receipts"
  on public.social_publication_receipts for select
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where id = auth.uid()
        and role = 'admin'
    )
  );

comment on table public.social_publication_receipts is
  'Private per-placement provider evidence for scheduled AeroTrade social publication. Pending claims fail closed and accepted provider IDs are never automatically repeated.';
