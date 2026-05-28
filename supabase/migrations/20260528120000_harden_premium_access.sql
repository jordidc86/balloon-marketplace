alter table public.users
  add column if not exists premium_source text check (premium_source in ('stripe', 'admin', 'legacy')),
  add column if not exists premium_granted_by uuid references public.users(id) on delete set null,
  add column if not exists premium_granted_at timestamp with time zone,
  add column if not exists premium_revoked_at timestamp with time zone,
  add column if not exists premium_last_stripe_event_id text;

update public.users
set
  premium_source = case
    when is_premium = true and stripe_subscription_id is not null then 'stripe'
    when is_premium = true then 'legacy'
    else premium_source
  end,
  premium_granted_at = case
    when is_premium = true and premium_granted_at is null then created_at
    else premium_granted_at
  end
where premium_source is null
  and is_premium = true;

drop policy if exists "Users can update their own profile" on public.users;
drop policy if exists "Users can update their own basic profile fields" on public.users;

create policy "Users can update their own basic profile fields" on public.users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.users from anon, authenticated;
grant update (name, phone, updated_at) on public.users to authenticated;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
  before update on public.users
  for each row execute procedure public.set_updated_at();
