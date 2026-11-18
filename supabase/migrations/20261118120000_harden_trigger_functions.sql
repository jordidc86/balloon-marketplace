-- Trigger routines are automatic internal hooks, not browser RPC endpoints.
-- Keep their bodies, trigger bindings and owner privilege context unchanged.
alter function public.handle_new_user() set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.enforce_commercial_outcome_status() from public, anon, authenticated;
revoke execute on function public.prevent_untracked_economics_basis_change() from public, anon, authenticated;
revoke execute on function public.record_initial_marketplace_offer() from public, anon, authenticated;

grant execute on function public.handle_new_user() to service_role, supabase_auth_admin;
grant execute on function public.enforce_commercial_outcome_status() to service_role;
grant execute on function public.prevent_untracked_economics_basis_change() to service_role;
grant execute on function public.record_initial_marketplace_offer() to service_role;
