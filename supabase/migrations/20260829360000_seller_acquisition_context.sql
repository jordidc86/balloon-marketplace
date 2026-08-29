alter table public.seller_assistance_requests
  drop constraint if exists seller_assistance_requests_source_context_check;

alter table public.seller_assistance_requests
  alter column source_context set default 'direct';

alter table public.seller_assistance_requests
  add constraint seller_assistance_requests_source_context_check
  check (source_context in (
    'sell_assisted', 'direct', 'navigation', 'home', 'dashboard', 'catalog_empty',
    'seller_seo', 'sell_gateway', 'assisted_conversion'
  ));

alter table public.seller_funnel_events
  add column if not exists entry_context text not null default 'system';

alter table public.seller_funnel_events
  drop constraint if exists seller_funnel_events_entry_context_check;

alter table public.seller_funnel_events
  add constraint seller_funnel_events_entry_context_check
  check (entry_context in (
    'system', 'direct', 'navigation', 'home', 'dashboard', 'catalog_empty',
    'seller_seo', 'sell_gateway', 'assisted_conversion'
  ));

create index if not exists seller_funnel_entry_context_created_idx
  on public.seller_funnel_events (entry_context, created_at desc);

comment on column public.seller_funnel_events.entry_context is
  'Closed, non-PII entry point used to measure which seller-acquisition path reaches publication.';

comment on column public.seller_assistance_requests.source_context is
  'Closed, non-PII source of an assisted-sale request; no URL or campaign free text is retained here.';
