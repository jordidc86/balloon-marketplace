alter table public.commercial_notification_receipts
  drop constraint if exists commercial_notification_receipts_notification_type_check,
  drop constraint if exists commercial_notification_receipts_entity_type_check;

alter table public.commercial_notification_receipts
  add constraint commercial_notification_receipts_notification_type_check check (notification_type in (
    'listing_created_admin','quote_created_admin','wanted_request_admin','listing_quality_quarantine','inquiry_buyer_ack',
    'inquiry_seller_followup','inquiry_buyer_seller_response','inquiry_seller_buyer_response','quote_admin_followup','premium_listing_checkout_recovery',
    'wanted_match_buyer','listing_verification_requested','listing_verification_decision','seller_assistance_created_admin',
    'seller_assistance_admin_followup','new_balloon_proposal_buyer','new_balloon_buyer_ack','listing_watch_confirmation','listing_watch_update',
    'listing_availability_request','new_balloon_proposal_response_admin','new_balloon_proposal_response_followup',
    'buyer_early_access_checkout_recovery'
  )),
  add constraint commercial_notification_receipts_entity_type_check check (entity_type in (
    'listing','quote_request','wanted_request','inquiry','seller_assistance','quote_proposal','listing_watch','premium_checkout_intent'
  ));

create or replace function public.due_buyer_early_access_checkout_recoveries(
  p_cutoff timestamp with time zone
)
returns table(
  intent_id uuid,
  user_id uuid,
  buyer_email text,
  source text,
  created_at timestamp with time zone
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  with latest_intent as (
    select distinct on (intent.user_id)
      intent.id,
      intent.user_id,
      intent.source,
      intent.status,
      intent.created_at
    from public.premium_checkout_intents intent
    order by intent.user_id, intent.created_at desc, intent.id desc
  )
  select latest.id, latest.user_id, users.email, latest.source, latest.created_at
  from latest_intent latest
  join public.users users on users.id = latest.user_id
  where latest.status = 'EXPIRED'
    and latest.source in ('signup', 'pricing', 'dashboard')
    and latest.created_at <= p_cutoff
    and users.is_premium = false
    and users.email is not null
    and char_length(btrim(users.email)) between 3 and 320
    and not exists (
      select 1
      from public.commercial_notification_receipts receipt
      where receipt.notification_type = 'buyer_early_access_checkout_recovery'
        and receipt.entity_type = 'premium_checkout_intent'
        and receipt.entity_id = latest.id
        and (
          receipt.status = 'accepted'
          or receipt.delivery_attempts >= 2
          or (
            receipt.delivery_attempts > 0
            and receipt.status in ('pending', 'failed')
            and receipt.next_attempt_at > timezone('utc'::text, now())
          )
        )
    )
  order by latest.created_at asc
  limit 100;
$$;

revoke all on function public.due_buyer_early_access_checkout_recoveries(timestamp with time zone) from public, anon, authenticated;
grant execute on function public.due_buyer_early_access_checkout_recoveries(timestamp with time zone) to service_role;

comment on function public.due_buyer_early_access_checkout_recoveries(timestamp with time zone) is
  'Returns only the latest buyer-initiated expired annual checkout for a non-Premium account. Accepted or exhausted recovery receipts suppress every repeat; no checkout or charge is created.';
