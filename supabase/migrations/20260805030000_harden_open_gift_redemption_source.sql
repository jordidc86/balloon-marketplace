-- Defense in depth for open-gift redemption. Historical marketplace rows may
-- contain legacy gift-ticket notes, but only a verified direct/WooCommerce gift
-- purchase may reach the mutating redemption implementation.

alter function public.vb_redeem_open_gift(text, date, jsonb, text, text)
  rename to vb_redeem_open_gift_internal_v1;
revoke all on function public.vb_redeem_open_gift_internal_v1(text, date, jsonb, text, text)
  from public, anon, authenticated, service_role;
create function public.vb_redeem_open_gift(
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
  v_source text;
  v_purchase_text text;
  v_verified_direct_gift boolean;
begin
  select * into v_reservation
  from public.vb_reservations as reservation
  where reservation.id = p_reservation_id
  for update;

  if not found then raise exception 'gift_reservation_not_found'; end if;

  v_source := lower(trim(coalesce(v_reservation.sale_source, '')));
  v_purchase_text := concat_ws(' ', coalesce(v_reservation.package_name, ''), coalesce(v_reservation.notes, ''));
  v_verified_direct_gift := (
    v_source = 'woocommerce'
    and v_purchase_text ~* '(billete[[:space:]_]+regalo|ticket[[:space:]_]+regalo|bono[[:space:]_]+regalo|reserva[[:space:]_]+abierta[[:space:]_/-]*regalo)'
  ) or (
    v_source = 'directa'
    and lower(coalesce(v_reservation.external_ref, '')) ~ '^web-[0-9]+$'
    and coalesce(v_reservation.notes, '') ~* 'pago[[:space:]]+redsys[[:space:]]+confirmado'
  );

  if v_source not in ('woocommerce', 'directa') then
    raise exception 'gift_reservation_source_not_eligible';
  end if;
  if not v_verified_direct_gift then
    raise exception 'gift_reservation_purchase_not_verified';
  end if;

  return query
  select *
  from public.vb_redeem_open_gift_internal_v1(
    p_reservation_id,
    p_flight_date,
    p_passenger_details,
    p_expected_external_ref,
    p_authorization_ref
  );
end;
$$;
revoke all on function public.vb_redeem_open_gift(text, date, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.vb_redeem_open_gift(text, date, jsonb, text, text)
  to service_role;
comment on function public.vb_redeem_open_gift(text, date, jsonb, text, text) is
  'Redeems only a verified direct/WooCommerce open gift after explicit authorization; marketplace reservations are rejected before mutation.';
