alter table public.quote_requests
  drop constraint if exists quote_requests_source_context_check;

alter table public.quote_requests
  add constraint quote_requests_source_context_check
  check (source_context in (
    'direct',
    'navigation',
    'home',
    'catalog',
    'catalog-empty',
    'listing',
    'sold-listing',
    'wanted',
    'about',
    'contact'
  ));

comment on column public.quote_requests.source_context is
  'Bounded commercial entry point for the new-balloon lead; sold-listing identifies demand recovered from previously public sold inventory and contains no URL, listing identifier or personal data.';
