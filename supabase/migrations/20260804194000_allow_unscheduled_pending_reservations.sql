alter table public.vb_reservations
  alter column flight_date drop not null;
alter table public.vb_reservations
  drop constraint if exists vb_reservations_confirmed_requires_flight_date;
alter table public.vb_reservations
  add constraint vb_reservations_confirmed_requires_flight_date
  check (status <> 'confirmed' or flight_date is not null);
create index if not exists vb_reservations_pending_without_date_idx
  on public.vb_reservations (updated_at)
  where status = 'pending' and flight_date is null;
comment on column public.vb_reservations.flight_date is
  'Null only while a non-confirmed reservation is waiting for a new flight date. Confirmed reservations require a real date.';
