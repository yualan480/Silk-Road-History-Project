-- Active-time Orbit payouts. Claimable once per minute by authenticated users.
-- Browser grants are requested only after 60 seconds of foreground, non-idle activity.
create or replace function public.claim_orbit_minute()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  last_at timestamptz;
  granted integer;
begin
  if uid is null then return 0; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('orbit-time-' || uid::text));
  select max(created_at) into last_at
    from public.orbit_ledger
   where user_id = uid and reason = 'time_on_orbit';
  if last_at is not null and now() - last_at < interval '55 seconds' then return 0; end if;
  insert into public.orbit_ledger (user_id, amount, reason, ref)
  values (uid, 100, 'time_on_orbit', 'min-' || floor(extract(epoch from now()) / 60)::bigint)
  on conflict (user_id, reason, ref) do nothing
  returning amount into granted;
  return coalesce(granted, 0);
end;
$function$;

-- Read-only, current-user breakdown for the leaderboard's active-time card.
-- The client provides local midnight so "today" follows the user's time zone.
create or replace function public.my_orbit_time_earnings(p_day_start timestamptz)
returns table(today_orbits bigint, all_time_orbits bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(sum(l.amount) filter (where l.created_at >= p_day_start), 0)::bigint,
    coalesce(sum(l.amount), 0)::bigint
  from public.orbit_ledger l
  where l.user_id = auth.uid()
    and l.reason = 'time_on_orbit';
$function$;
revoke all on function public.my_orbit_time_earnings(timestamptz) from public;
grant execute on function public.my_orbit_time_earnings(timestamptz) to authenticated;
