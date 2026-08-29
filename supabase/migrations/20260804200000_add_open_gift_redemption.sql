create or replace function public.vb_redeem_open_gift(
  p_reservation_id text,
  p_flight_date date,
  p_passenger_details jsonb,
  p_expected_external_ref text,
  p_authorization_ref text
)
returns table(
  reservation_id text,
  redeemed_flight_date date,
  redeemed_flight_time time,
  passenger_count integer,
  redeemed_total_weight_kg numeric,
  assigned_balloon_id text,
  gift_tickets_redeemed integer,
  confirmed_seats_before integer,
  held_seats integer,
  sellable_capacity integer,
  economic_actions_performed integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.vb_reservations%rowtype;
  v_departure public.vb_departures%rowtype;
  v_party_size integer;
  v_total_weight numeric(10,2);
  v_raw_passengers text;
  v_confirmed integer;
  v_held integer;
  v_bcx integer;
  v_bcy integer;
  v_unassigned integer;
  v_bcx_capacity integer;
  v_balloon_id text;
  v_codes text[];
  v_code text;
  v_ticket_count integer := 0;
  v_index integer;
  v_now timestamptz := now();
  v_marker text;
begin
  if nullif(trim(p_authorization_ref), '') is null then
    raise exception 'explicit_authorization_required';
  end if;
  if p_flight_date is null or p_flight_date < current_date then
    raise exception 'redemption_date_invalid';
  end if;
  if jsonb_typeof(p_passenger_details) <> 'array' then
    raise exception 'passenger_details_invalid';
  end if;

  select * into v_reservation
  from public.vb_reservations as reservation
  where reservation.id = p_reservation_id
  for update;

  if not found then raise exception 'gift_reservation_not_found'; end if;
  if lower(coalesce(v_reservation.external_ref, '')) <> lower(trim(p_expected_external_ref)) then
    raise exception 'gift_external_reference_mismatch';
  end if;

  v_marker := 'canje_regalo:' || p_flight_date::text;
  if v_reservation.status = 'confirmed'
    and v_reservation.flight_date = p_flight_date
    and position(v_marker in coalesce(v_reservation.notes, '')) > 0 then
    select count(*)::integer into v_ticket_count
    from public.vb_gift_tickets as ticket
    where ticket.reservation_id = p_reservation_id and ticket.status = 'redeemed';
    return query select
      v_reservation.id, v_reservation.flight_date, v_reservation.flight_time,
      v_reservation.passengers, v_reservation.total_weight_kg, v_reservation.balloon_id,
      v_ticket_count, 0, 0, 0, 0;
    return;
  end if;

  if v_reservation.status <> 'pending'
    or v_reservation.flight_date not in (date '9999-12-31', date '2099-12-31') then
    raise exception 'gift_reservation_not_open';
  end if;

  v_party_size := jsonb_array_length(p_passenger_details);
  if v_party_size < 1 or v_party_size <> v_reservation.passengers then
    raise exception 'gift_passenger_count_mismatch';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_passenger_details) as passenger(value)
    where length(trim(coalesce(passenger.value ->> 'name', ''))) < 3
      or coalesce((passenger.value ->> 'weightKg')::numeric, 0) < 20
      or coalesce((passenger.value ->> 'weightKg')::numeric, 0) > 250
  ) then
    raise exception 'gift_passenger_details_incomplete';
  end if;

  select * into v_departure
  from public.vb_departures as departure
  where departure.flight_date = p_flight_date
    and departure.sandbox = false
    and departure.availability_status = 'open'
  order by departure.flight_time
  limit 1
  for update;
  if not found then raise exception 'gift_departure_unavailable'; end if;

  select coalesce(sum(reservation.passengers), 0)::integer into v_confirmed
  from public.vb_reservations as reservation
  where reservation.flight_date = p_flight_date
    and reservation.status in ('confirmed', 'completed')
    and reservation.id <> p_reservation_id;

  select coalesce(sum(hold.seats), 0)::integer into v_held
  from public.vb_inventory_holds as hold
  where hold.departure_id = v_departure.id
    and hold.status = 'active'
    and hold.expires_at > v_now;

  if v_confirmed + v_held + v_party_size > v_departure.sellable_capacity then
    raise exception 'gift_departure_insufficient_capacity';
  end if;

  select
    coalesce(sum(reservation.passengers) filter (where lower(reservation.balloon_id) = 'cs-bcx'), 0)::integer,
    coalesce(sum(reservation.passengers) filter (where lower(reservation.balloon_id) = 'cs-bcy'), 0)::integer,
    coalesce(sum(reservation.passengers) filter (where lower(coalesce(reservation.balloon_id, '')) not in ('cs-bcx', 'cs-bcy')), 0)::integer
  into v_bcx, v_bcy, v_unassigned
  from public.vb_reservations as reservation
  where reservation.flight_date = p_flight_date
    and reservation.status in ('confirmed', 'completed')
    and reservation.id <> p_reservation_id;

  if v_unassigned > 0 then raise exception 'gift_balloon_assignment_requires_reconciliation'; end if;
  v_bcx_capacity := case when extract(month from p_flight_date)::integer between 6 and 9 then 22 else 24 end;
  if v_bcx + v_party_size <= v_bcx_capacity
    and (v_bcx_capacity - v_bcx >= 19 - v_bcy or v_bcy + v_party_size > 19) then
    v_balloon_id := 'cs-bcx';
  elsif v_bcy + v_party_size <= 19 then
    v_balloon_id := 'cs-bcy';
  elsif v_bcx + v_party_size <= v_bcx_capacity then
    v_balloon_id := 'cs-bcx';
  else
    raise exception 'gift_balloon_capacity_unavailable';
  end if;

  select
    sum((passenger.value ->> 'weightKg')::numeric),
    string_agg(trim(passenger.value ->> 'name') || ' ' || (passenger.value ->> 'weightKg') || ' kg', '; ' order by passenger.position)
  into v_total_weight, v_raw_passengers
  from jsonb_array_elements(p_passenger_details) with ordinality as passenger(value, position);

  update public.vb_reservations
  set status = 'confirmed',
      flight_date = p_flight_date,
      flight_time = v_departure.flight_time,
      passenger_details = p_passenger_details,
      total_weight_kg = v_total_weight,
      raw_passenger_text = v_raw_passengers,
      balloon_id = v_balloon_id,
      google_calendar_status = 'pending',
      google_calendar_event_id = '',
      needs_review = false,
      manual_override_fields = coalesce(manual_override_fields, '[]'::jsonb) || '["flightDate","status","passengerDetails","totalWeightKg","balloonId"]'::jsonb,
      notes = case when position(v_marker in coalesce(notes, '')) > 0 then notes
        else trim(both ' ' from coalesce(notes, '')) || ' | ' || v_marker || ' | autorizacion:' || trim(p_authorization_ref) end,
      updated_at = v_now
  where id = p_reservation_id;

  select array_agg(match[1]) into v_codes
  from regexp_matches(
    coalesce(v_reservation.notes, ''),
    '(VB-[0-9]{4}-[0-9]{5}-[0-9]{2})',
    'g'
  ) as extracted(match);

  for v_index in 1..v_party_size loop
    v_code := coalesce(
      v_codes[v_index],
      'VB-' || extract(year from v_now)::integer || '-' ||
        lpad(nullif(regexp_replace(coalesce(v_reservation.external_ref, ''), '[^0-9]', '', 'g'), ''), 5, '0') || '-' ||
        lpad(v_index::text, 2, '0')
    );
    if v_code is null then raise exception 'gift_ticket_code_unavailable'; end if;
    insert into public.vb_gift_tickets (
      code, reservation_id, buyer_name, buyer_email, recipient_name, passenger_count,
      status, redeemed_reservation_id, redeemed_at, notes, updated_at
    ) values (
      v_code, p_reservation_id, v_reservation.lead_name, v_reservation.email,
      trim(p_passenger_details -> (v_index - 1) ->> 'name'), 1,
      'redeemed', p_reservation_id, v_now,
      'redeemed_with_explicit_authorization:' || trim(p_authorization_ref), v_now
    )
    on conflict (code) do update set
      reservation_id = excluded.reservation_id,
      recipient_name = excluded.recipient_name,
      status = 'redeemed',
      redeemed_reservation_id = excluded.redeemed_reservation_id,
      redeemed_at = coalesce(public.vb_gift_tickets.redeemed_at, excluded.redeemed_at),
      notes = excluded.notes,
      updated_at = excluded.updated_at;
    v_ticket_count := v_ticket_count + 1;
  end loop;

  update public.vb_automation_tasks
  set status = 'resolved', resolved_at = v_now, updated_at = v_now
  where status <> 'resolved'
    and (stable_key = 'gift-redemption:' || p_reservation_id || ':' || p_flight_date::text
      or stable_key = 'reservation:' || p_reservation_id || ':gift_ticket_review');

  insert into public.vb_automation_events (
    event_type, severity, status, reservation_id, channel, details
  ) values (
    'gift_ticket_redemption', 'info', 'completed', p_reservation_id, 'whatsapp',
    jsonb_build_object(
      'flightDate', p_flight_date,
      'passengers', v_party_size,
      'balloonId', v_balloon_id,
      'authorizationRef', trim(p_authorization_ref),
      'economicActionsPerformed', 0
    )
  );

  return query select
    p_reservation_id, p_flight_date, v_departure.flight_time, v_party_size,
    v_total_weight, v_balloon_id, v_ticket_count, v_confirmed, v_held,
    v_departure.sellable_capacity, 0;
end;
$$;
revoke all on function public.vb_redeem_open_gift(text, date, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.vb_redeem_open_gift(text, date, jsonb, text, text)
  to service_role;
comment on function public.vb_redeem_open_gift(text, date, jsonb, text, text) is
  'Atomically redeems an already-paid open gift after explicit authorization; performs no charge or refund.';
