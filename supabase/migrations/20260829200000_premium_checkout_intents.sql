create table if not exists public.premium_checkout_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_session_id text not null unique,
  source text not null check (source in ('signup', 'pricing', 'dashboard', 'historical')),
  status text not null default 'STARTED' check (status in ('STARTED', 'COMPLETED', 'EXPIRED', 'SUPERSEDED')),
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  completed_at timestamp with time zone
);

create index if not exists premium_checkout_intents_user_created_idx
  on public.premium_checkout_intents (user_id, created_at desc);

alter table public.premium_checkout_intents enable row level security;

revoke all on public.premium_checkout_intents from anon, authenticated;

comment on table public.premium_checkout_intents is
  'Private recovery ledger for Premium checkout attempts. It stores no card data, checkout URL or free text.';
