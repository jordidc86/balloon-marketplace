create table if not exists public.quote_requests (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text not null,
  phone text,
  country text,
  manufacturer_preference text,
  equipment_type text not null,
  volume_or_capacity text,
  intended_use text,
  budget_range text,
  timeline text,
  colors_or_branding text,
  notes text,
  status text default 'NEW' check (status in ('NEW', 'CONTACTED', 'SENT_TO_PARTNER', 'QUOTE_SENT', 'WON', 'LOST')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.quote_requests enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'quote_requests'
      and policyname = 'Admins can do everything on quote_requests'
  ) then
    create policy "Admins can do everything on quote_requests" on public.quote_requests for all
      using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));
  end if;
end $$;
