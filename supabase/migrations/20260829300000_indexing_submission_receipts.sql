-- Private evidence for public-URL discovery submissions. It stores only an
-- aggregate fingerprint and counts, never search queries, credentials or PII.
create table if not exists public.indexing_submission_receipts (
  id uuid default uuid_generate_v4() primary key,
  batch_key text not null unique check (char_length(batch_key) = 64),
  provider text not null default 'INDEXNOW' check (provider = 'INDEXNOW'),
  url_fingerprint text not null check (char_length(url_fingerprint) = 64),
  url_count integer not null check (url_count between 1 and 10000),
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'FAILED')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  provider_status_code integer check (provider_status_code is null or provider_status_code between 100 and 599),
  error_code text check (error_code is null or error_code in ('NETWORK_ERROR', 'PROVIDER_REJECTED', 'PERSISTENCE_ERROR')),
  attempted_at timestamp with time zone,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint indexing_submission_acceptance_consistency check (
    (status = 'ACCEPTED' and accepted_at is not null and error_code is null)
    or (status <> 'ACCEPTED' and accepted_at is null)
  )
);

create index if not exists indexing_submission_status_idx
  on public.indexing_submission_receipts (status, attempted_at desc);

drop trigger if exists set_indexing_submission_receipts_updated_at on public.indexing_submission_receipts;
create trigger set_indexing_submission_receipts_updated_at
  before update on public.indexing_submission_receipts
  for each row execute procedure public.set_updated_at();

alter table public.indexing_submission_receipts enable row level security;
revoke all on public.indexing_submission_receipts from anon, authenticated;

drop policy if exists "Admins can read indexing submission receipts" on public.indexing_submission_receipts;
create policy "Admins can read indexing submission receipts"
  on public.indexing_submission_receipts for select to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

comment on table public.indexing_submission_receipts is
  'Private aggregate evidence of public URL discovery submissions; stores no URL list, query, credential or personal data.';
