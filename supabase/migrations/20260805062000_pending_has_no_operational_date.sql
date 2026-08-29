update public.vb_reservations
set
  notes = concat_ws(
    ' | ',
    nullif(trim(coalesce(notes, '')), ''),
    'fecha_solicitada_pendiente:' || flight_date::text
  ),
  flight_date = null,
  flight_time = ''
where status = 'pending'
  and flight_date is not null
  and flight_date not in (date '2099-12-31', date '9999-12-31')
  and coalesce(notes, '') not like '%fecha_solicitada_pendiente:' || flight_date::text || '%';
alter table public.vb_reservations
  drop constraint if exists vb_reservations_pending_has_no_operational_date;
alter table public.vb_reservations
  add constraint vb_reservations_pending_has_no_operational_date
  check (
    status <> 'pending'
    or flight_date is null
    or flight_date in (date '2099-12-31', date '9999-12-31')
  );
comment on constraint vb_reservations_pending_has_no_operational_date on public.vb_reservations is
  'A pending reservation has no operational flight date. The 2099/9999 sentinels are legacy storage for open gift entitlements.';
