-- Run the complete file in Supabase SQL Editor as the database owner.
-- Sets No to FIVE TOTAL, without impersonating other users.
-- Re-running does not add another five. Real votes are never removed or changed.
begin;
-- Hold vote writes briefly so the total is calculated from a consistent tally.
lock table public.poll_votes in share row exclusive mode;
alter table public.poll_options add column if not exists manual_votes integer not null default 0 check (manual_votes >= 0);
-- poll_options already has authenticated SELECT-only permissions and RLS.
-- Its manual tally cannot be changed through the normal vote_poll RPC.
do $$
declare
  matches uuid[];
  target_option_id uuid;
  real_votes integer;
begin
  select array_agg(o.id) into matches
  from public.poll_options o
  join public.polls p on p.id=o.poll_id
  join public.messages m on m.id=p.message_id
  where lower(trim(o.label))='no'
    and (p.ends_at is null or p.ends_at>now())
    and lower(regexp_replace(m.content,'[^a-zA-Z0-9]','','g'))='shouldthegmstesdcalendarteacherslistberemoved';
  if coalesce(cardinality(matches),0)<>1 then
    raise exception 'Expected exactly one matching active No option; found %. Nothing changed.', coalesce(cardinality(matches),0);
  end if;
  target_option_id:=matches[1];
  perform 1 from public.polls where id=(select o.poll_id from public.poll_options o where o.id=target_option_id) for update;
  perform 1 from public.poll_options o where o.id=target_option_id for update;
  select count(*) into real_votes from public.poll_votes v where v.option_id=target_option_id;
  if real_votes>5 then raise exception 'No already has % real votes. No real votes were removed.',real_votes; end if;
  update public.poll_options o set manual_votes=5-real_votes where o.id=target_option_id;
  raise notice 'No now totals 5: % real votes and % visibly labeled admin-added votes.',real_votes,5-real_votes;
end $$;
notify pgrst, 'reload schema';
commit;
