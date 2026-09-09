-- Preserve the audit trail while removing confirmed spam from operational follow-ups.
update public.quote_requests
set
  status = 'LOST',
  updated_at = timezone('utc'::text, now())
where lower(trim(name)) = 'robertagifs'
  and status not in ('WON', 'LOST');
