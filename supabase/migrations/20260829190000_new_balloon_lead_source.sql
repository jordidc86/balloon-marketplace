alter table public.quote_requests
  add column if not exists source_context text not null default 'direct';

alter table public.quote_requests
  drop constraint if exists quote_requests_source_context_check;

alter table public.quote_requests
  add constraint quote_requests_source_context_check
  check (source_context in ('direct', 'navigation', 'home', 'catalog', 'catalog-empty', 'listing', 'wanted'));

create index if not exists quote_requests_source_context_created_at_idx
  on public.quote_requests (source_context, created_at desc);

comment on column public.quote_requests.source_context is
  'Bounded commercial entry point for the new-balloon lead; contains no URL, identifier or personal data.';
