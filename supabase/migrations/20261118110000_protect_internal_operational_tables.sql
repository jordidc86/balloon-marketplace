-- Internal operational tables share the project but are not browser APIs.
-- Keep owner/service-role access and existing internal functions unchanged.
-- Preserve every row; block direct anonymous and ordinary authenticated access.
set lock_timeout = '5s';
alter table public.vb_automation_events enable row level security;
revoke all privileges on table public.vb_automation_events from public, anon, authenticated;
alter table public.vb_automation_tasks enable row level security;
revoke all privileges on table public.vb_automation_tasks from public, anon, authenticated;
alter table public.vb_gift_tickets enable row level security;
revoke all privileges on table public.vb_gift_tickets from public, anon, authenticated;
alter table public.vb_message_campaigns enable row level security;
revoke all privileges on table public.vb_message_campaigns from public, anon, authenticated;
alter table public.vb_message_log enable row level security;
revoke all privileges on table public.vb_message_log from public, anon, authenticated;
alter table public.vb_timeclock_adjustments enable row level security;
revoke all privileges on table public.vb_timeclock_adjustments from public, anon, authenticated;
alter table public.vb_timeclock_employees enable row level security;
revoke all privileges on table public.vb_timeclock_employees from public, anon, authenticated;
alter table public.vb_timeclock_punches enable row level security;
revoke all privileges on table public.vb_timeclock_punches from public, anon, authenticated;
alter table public.vb_whatsapp_contacts enable row level security;
revoke all privileges on table public.vb_whatsapp_contacts from public, anon, authenticated;
alter table public.vb_whatsapp_conversation_events enable row level security;
revoke all privileges on table public.vb_whatsapp_conversation_events from public, anon, authenticated;
alter table public.vb_whatsapp_conversation_reservations enable row level security;
revoke all privileges on table public.vb_whatsapp_conversation_reservations from public, anon, authenticated;
alter table public.vb_whatsapp_conversations enable row level security;
revoke all privileges on table public.vb_whatsapp_conversations from public, anon, authenticated;

do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity
  ) then raise exception 'Public tables without RLS remain; review current schema'; end if;
end $$;
reset lock_timeout;
