-- Auditable verification workflow without uploading or retaining identity or
-- aircraft documents. Only closed evidence categories and state transitions are stored.

alter table public.listing_verifications
  add column if not exists requested_by uuid references public.users(id) on delete set null,
  add column if not exists requested_at timestamp with time zone,
  add column if not exists identity_review_basis text,
  add column if not exists supporting_evidence_types text[] not null default '{}'::text[],
  add column if not exists decision_reason text,
  add column if not exists review_scope_acknowledged boolean not null default false,
  add column if not exists last_decided_at timestamp with time zone;

alter table public.listing_verifications
  drop constraint if exists listing_verifications_identity_review_basis_check,
  drop constraint if exists listing_verifications_supporting_evidence_types_check,
  drop constraint if exists listing_verifications_decision_reason_check,
  drop constraint if exists listing_verifications_verified_evidence_check;

alter table public.listing_verifications
  add constraint listing_verifications_identity_review_basis_check check (
    identity_review_basis is null or identity_review_basis in (
      'ACCOUNT_AND_LIVE_CALL', 'BUSINESS_REGISTRY', 'IDENTITY_DOCUMENT_REVIEWED'
    )
  ),
  add constraint listing_verifications_supporting_evidence_types_check check (
    supporting_evidence_types <@ array[
      'REGISTRATION', 'SERIAL_PLATE', 'PURCHASE_OR_OWNERSHIP',
      'MAINTENANCE_RECORDS', 'INSPECTION_RECORD', 'MANUFACTURER_RECORD',
      'OTHER_SUPPORTING'
    ]::text[]
  ),
  add constraint listing_verifications_decision_reason_check check (
    decision_reason is null or decision_reason in (
      'IDENTITY_UNCONFIRMED', 'INSUFFICIENT_EVIDENCE',
      'LISTING_DATA_INCONSISTENT', 'EVIDENCE_NOT_CURRENT',
      'OTHER_REVIEW_REQUIRED'
    )
  ),
  add constraint listing_verifications_verified_evidence_check check (
    status <> 'VERIFIED' or (
      identity_checked = true
      and supporting_documents_checked = true
      and identity_review_basis is not null
      and cardinality(supporting_evidence_types) >= 1
      and review_scope_acknowledged = true
      and verified_by is not null
      and verified_at is not null
    )
  );

create index if not exists listing_verifications_review_queue_idx
  on public.listing_verifications (status, requested_at asc)
  where status = 'IN_REVIEW';

create table if not exists public.listing_verification_events (
  id uuid default uuid_generate_v4() primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('REQUESTED', 'VERIFIED', 'REJECTED', 'UNVERIFIED')),
  from_status text check (from_status is null or from_status in ('UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED')),
  to_status text not null check (to_status in ('UNVERIFIED', 'IN_REVIEW', 'VERIFIED', 'REJECTED')),
  identity_review_basis text check (
    identity_review_basis is null or identity_review_basis in (
      'ACCOUNT_AND_LIVE_CALL', 'BUSINESS_REGISTRY', 'IDENTITY_DOCUMENT_REVIEWED'
    )
  ),
  supporting_evidence_types text[] not null default '{}'::text[] check (
    supporting_evidence_types <@ array[
      'REGISTRATION', 'SERIAL_PLATE', 'PURCHASE_OR_OWNERSHIP',
      'MAINTENANCE_RECORDS', 'INSPECTION_RECORD', 'MANUFACTURER_RECORD',
      'OTHER_SUPPORTING'
    ]::text[]
  ),
  decision_reason text check (
    decision_reason is null or decision_reason in (
      'IDENTITY_UNCONFIRMED', 'INSUFFICIENT_EVIDENCE',
      'LISTING_DATA_INCONSISTENT', 'EVIDENCE_NOT_CURRENT',
      'OTHER_REVIEW_REQUIRED'
    )
  ),
  created_at timestamp with time zone not null default timezone('utc'::text, now())
);

create index if not exists listing_verification_events_listing_idx
  on public.listing_verification_events (listing_id, created_at desc);

alter table public.listing_verification_events enable row level security;
revoke all on public.listing_verification_events from anon, authenticated;
grant select on public.listing_verification_events to authenticated;

drop policy if exists "Sellers can view verification events for their listings" on public.listing_verification_events;
create policy "Sellers can view verification events for their listings"
  on public.listing_verification_events for select to authenticated
  using (exists (
    select 1 from public.listings
    where listings.id = listing_verification_events.listing_id
      and listings.seller_id = auth.uid()
  ));

drop policy if exists "Admins can manage listing verification events" on public.listing_verification_events;
create policy "Admins can manage listing verification events"
  on public.listing_verification_events for all to authenticated
  using (exists (select 1 from public.users where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.users where id = auth.uid() and role = 'admin'));

alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check
    check (notification_type in (
      'listing_created_admin', 'quote_created_admin', 'wanted_request_admin',
      'listing_quality_quarantine', 'inquiry_buyer_ack',
      'inquiry_seller_followup', 'quote_admin_followup',
      'premium_listing_checkout_recovery', 'wanted_match_buyer',
      'listing_verification_requested', 'listing_verification_decision'
    ));

-- State and audit evidence must move atomically. These functions are callable
-- only by the service role after the application has authenticated the actor.
create or replace function public.request_listing_verification(
  p_listing_id uuid,
  p_requester uuid
)
returns table(event_id uuid, verification_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  new_event_id uuid;
begin
  if not exists (
    select 1
    from public.listings
    where id = p_listing_id
      and seller_id = p_requester
      and status in ('ACTIVE_PUBLIC', 'ACTIVE_PREMIUM')
      and coalesce(details ->> 'supporting_documents_available', 'false') = 'true'
  ) then
    raise exception 'Listing is not eligible for verification review';
  end if;

  select status into current_status
  from public.listing_verifications
  where listing_id = p_listing_id
  for update;

  if current_status in ('IN_REVIEW', 'VERIFIED') then
    raise exception 'Listing verification is already active';
  end if;

  insert into public.listing_verifications (
    listing_id, status, requested_by, requested_at,
    identity_checked, supporting_documents_checked,
    identity_review_basis, supporting_evidence_types,
    decision_reason, review_scope_acknowledged,
    verified_by, verified_at, last_decided_at
  ) values (
    p_listing_id, 'IN_REVIEW', p_requester, timezone('utc'::text, now()),
    false, false, null, '{}'::text[], null, false,
    null, null, null
  )
  on conflict (listing_id) do update set
    status = 'IN_REVIEW',
    requested_by = excluded.requested_by,
    requested_at = excluded.requested_at,
    identity_checked = false,
    supporting_documents_checked = false,
    identity_review_basis = null,
    supporting_evidence_types = '{}'::text[],
    decision_reason = null,
    review_scope_acknowledged = false,
    verified_by = null,
    verified_at = null;

  insert into public.listing_verification_events (
    listing_id, actor_user_id, event_type, from_status, to_status
  ) values (
    p_listing_id, p_requester, 'REQUESTED', current_status, 'IN_REVIEW'
  ) returning id into new_event_id;

  return query select new_event_id, 'IN_REVIEW'::text;
end;
$$;

create or replace function public.decide_listing_verification(
  p_listing_id uuid,
  p_admin uuid,
  p_action text,
  p_identity_review_basis text default null,
  p_supporting_evidence_types text[] default '{}'::text[],
  p_decision_reason text default null,
  p_review_scope_acknowledged boolean default false
)
returns table(event_id uuid, verification_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  next_status text;
  next_event_type text;
  new_event_id uuid;
begin
  if not exists (select 1 from public.users where id = p_admin and role = 'admin') then
    raise exception 'Administrator authorization is required';
  end if;

  select status into current_status
  from public.listing_verifications
  where listing_id = p_listing_id
  for update;

  if p_action in ('verify', 'reject') and current_status is distinct from 'IN_REVIEW' then
    raise exception 'Only queued verification requests can be decided';
  end if;
  if p_action = 'unverify' and current_status is distinct from 'VERIFIED' then
    raise exception 'Only verified listings can be unverified';
  end if;
  if p_action not in ('verify', 'reject', 'unverify') then
    raise exception 'Invalid verification action';
  end if;

  next_status := case p_action
    when 'verify' then 'VERIFIED'
    when 'reject' then 'REJECTED'
    else 'UNVERIFIED'
  end;
  next_event_type := case p_action
    when 'verify' then 'VERIFIED'
    when 'reject' then 'REJECTED'
    else 'UNVERIFIED'
  end;

  update public.listing_verifications set
    status = next_status,
    identity_checked = (p_action = 'verify'),
    supporting_documents_checked = (p_action = 'verify'),
    identity_review_basis = case when p_action = 'verify' then p_identity_review_basis else null end,
    supporting_evidence_types = case when p_action = 'verify' then p_supporting_evidence_types else '{}'::text[] end,
    decision_reason = case when p_action = 'verify' then null else p_decision_reason end,
    review_scope_acknowledged = (p_action = 'verify' and p_review_scope_acknowledged),
    verified_by = case when p_action = 'verify' then p_admin else null end,
    verified_at = case when p_action = 'verify' then timezone('utc'::text, now()) else null end,
    last_decided_at = timezone('utc'::text, now())
  where listing_id = p_listing_id;

  insert into public.listing_verification_events (
    listing_id, actor_user_id, event_type, from_status, to_status,
    identity_review_basis, supporting_evidence_types, decision_reason
  ) values (
    p_listing_id, p_admin, next_event_type, current_status, next_status,
    case when p_action = 'verify' then p_identity_review_basis else null end,
    case when p_action = 'verify' then p_supporting_evidence_types else '{}'::text[] end,
    case when p_action = 'verify' then null else p_decision_reason end
  ) returning id into new_event_id;

  return query select new_event_id, next_status;
end;
$$;

revoke all on function public.request_listing_verification(uuid, uuid) from public, anon, authenticated;
revoke all on function public.decide_listing_verification(uuid, uuid, text, text, text[], text, boolean) from public, anon, authenticated;
grant execute on function public.request_listing_verification(uuid, uuid) to service_role;
grant execute on function public.decide_listing_verification(uuid, uuid, text, text, text[], text, boolean) to service_role;

comment on function public.request_listing_verification(uuid, uuid) is
  'Atomically queues one seller-owned eligible listing and appends its audit event; stores no document copy.';
comment on function public.decide_listing_verification(uuid, uuid, text, text, text[], text, boolean) is
  'Atomically decides one queued review and appends closed-category audit evidence; stores no document copy.';
