alter table public.premium_checkout_intents
  drop constraint if exists premium_checkout_intents_source_check;

alter table public.premium_checkout_intents
  add constraint premium_checkout_intents_source_check
  check (source in ('signup', 'pricing', 'dashboard', 'admin', 'historical'));
