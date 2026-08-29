-- Distinguish actual catalogue searches from localized acquisition-page visits
-- without creating a parallel analytics ledger or retaining a raw visitor id.

alter table public.catalog_search_events
  add column if not exists entry_context text not null default 'catalog_search';

alter table public.catalog_search_events
  drop constraint if exists catalog_search_events_entry_context_check;

alter table public.catalog_search_events
  add constraint catalog_search_events_entry_context_check
  check (entry_context in (
    'catalog_search',
    'buyer_landing_en',
    'buyer_landing_de',
    'buyer_landing_fr',
    'buyer_landing_es'
  ));

create index if not exists catalog_search_entry_context_created_idx
  on public.catalog_search_events (entry_context, created_at desc);

comment on column public.catalog_search_events.entry_context is
  'Closed, non-PII acquisition entry. It contains no URL, search text, visitor identifier or personal data.';
