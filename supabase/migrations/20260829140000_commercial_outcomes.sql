-- Private evidence for marketplace outcomes. Values recorded here are not
-- assumed payments: the evidence level distinguishes a report from documented
-- or settled revenue.
create table if not exists public.commercial_outcomes (
  id uuid default uuid_generate_v4() primary key,
  entity_type text not null
    check (entity_type in ('marketplace_inquiry', 'quote_request')),
  entity_id uuid not null,
  outcome_type text not null default 'sale'
    check (outcome_type in ('sale', 'intermediation', 'other')),
  currency text not null default 'EUR'
    check (currency in ('EUR', 'GBP', 'USD')),
  gross_amount_minor bigint not null default 0
    check (gross_amount_minor >= 0),
  aerotrade_revenue_minor bigint not null default 0
    check (aerotrade_revenue_minor >= 0 and aerotrade_revenue_minor <= gross_amount_minor),
  evidence_level text not null default 'reported'
    check (evidence_level in ('reported', 'documented', 'settled')),
  notes text check (notes is null or char_length(notes) <= 2000),
  recorded_by uuid references public.users(id) on delete set null,
  closed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (entity_type, entity_id)
);

create index if not exists commercial_outcomes_evidence_closed_idx
  on public.commercial_outcomes (evidence_level, closed_at desc);

drop trigger if exists set_commercial_outcomes_updated_at on public.commercial_outcomes;
create trigger set_commercial_outcomes_updated_at
  before update on public.commercial_outcomes
  for each row execute procedure public.set_updated_at();

alter table public.commercial_outcomes enable row level security;
revoke all on public.commercial_outcomes from anon, authenticated;

drop policy if exists "Admins can manage commercial outcomes" on public.commercial_outcomes;
create policy "Admins can manage commercial outcomes"
  on public.commercial_outcomes for all
  to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));
