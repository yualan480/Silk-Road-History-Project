-- Orbit tournaments: dated events, automatic game-score capture, and a weekly rotation.
-- Apply to the ORBIT Supabase project (qtmrtxgkisshdtqshjre), after migration-tournaments.sql.
-- Past events and their results are preserved; only generated events are auto-managed.

begin;

alter table public.tournaments add column if not exists ends_at timestamptz;
alter table public.tournaments add column if not exists started_at timestamptz;
alter table public.tournaments add column if not exists auto_generated boolean not null default false;

-- The original schema did not store an end date. Existing tournaments use a
-- seven-day window until staff edit the exact date from the tournament editor.
update public.tournaments set ends_at = starts_at + interval '7 days' where ends_at is null;
alter table public.tournaments alter column ends_at set not null;

create index if not exists tournaments_auto_rotation_idx
  on public.tournaments (starts_at, status) where auto_generated;
create unique index if not exists tournaments_auto_week_idx
  on public.tournaments (starts_at) where auto_generated;

-- Note the ACTUAL moment a tournament becomes live, even if staff start late.
create schema if not exists private;
create or replace function private.tournament_stamp_start()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'live' and old.status is distinct from 'live' then
    new.started_at := now();
  end if;
  return new;
end $$;
drop trigger if exists tournament_stamp_start on public.tournaments;
create trigger tournament_stamp_start before update on public.tournaments
  for each row execute function private.tournament_stamp_start();
revoke all on function private.tournament_stamp_start() from public, anon, authenticated;

-- The editor sends p_ends, which the original save RPC did not accept.
create or replace function public.tournament_save(
  p_id uuid, p_title text, p_game text, p_format text,
  p_description text, p_rules text, p_starts timestamptz, p_ends timestamptz,
  p_reg_closes timestamptz, p_max integer, p_prize_text text,
  p_orbit_prizes boolean, p_publish boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_title text := btrim(coalesce(p_title, '')); v_id uuid := p_id; cur public.tournaments;
begin
  if auth.uid() is null or not public.orbit_staff() then raise exception 'Only Orbit staff can manage tournaments.'; end if;
  if char_length(v_title) < 3 or char_length(v_title) > 80 then raise exception 'The title must be 3 to 80 characters.'; end if;
  if p_game is null or not (p_game = any (public.tournament_games())) then raise exception 'Pick a game from Orbit Games.'; end if;
  if p_format not in ('bracket', 'leaderboard') then raise exception 'Unknown format.'; end if;
  if p_starts is null or p_ends is null or p_ends <= p_starts then raise exception 'The end date must be after the start date.'; end if;
  if p_max is null or p_max < 2 or p_max > 64 then raise exception 'Players must be between 2 and 64.'; end if;
  if p_reg_closes is not null and p_reg_closes > p_starts then raise exception 'Sign-ups must close by the start.'; end if;
  if char_length(coalesce(p_description, '')) > 1500 or char_length(coalesce(p_rules, '')) > 3000 then raise exception 'The description or rules are too long.'; end if;
  if char_length(coalesce(p_prize_text, '')) > 200 then raise exception 'The prize note is too long.'; end if;
  v_title := public.orbit_clean(v_title);
  if v_id is null then
    insert into public.tournaments
      (title, game, format, description, rules, starts_at, ends_at, reg_closes_at,
       max_players, prize_text, orbit_prizes, status, created_by)
      values (v_title, p_game, p_format, public.orbit_clean(btrim(coalesce(p_description, ''))),
        public.orbit_clean(btrim(coalesce(p_rules, ''))), p_starts, p_ends, p_reg_closes,
        p_max, public.orbit_clean(btrim(coalesce(p_prize_text, ''))), coalesce(p_orbit_prizes, true),
        case when p_publish then 'open' else 'draft' end, auth.uid()) returning id into v_id;
  else
    select * into cur from public.tournaments where id = v_id for update;
    if cur.id is null then raise exception 'Tournament not found.'; end if;
    if cur.auto_generated then raise exception 'Automatic tournaments are managed by the rotation. Cancel this one if necessary.'; end if;
    if cur.status in ('live', 'completed') and (cur.game <> p_game or cur.format <> p_format or cur.starts_at <> p_starts) then
      raise exception 'Game, format and start date cannot change after the tournament begins.';
    end if;
    if p_max < (select count(*) from public.tournament_players where tournament_id = v_id and status = 'registered') then
      raise exception 'More players than that are already registered.';
    end if;
    update public.tournaments set title = v_title, game = p_game, format = p_format,
      description = public.orbit_clean(btrim(coalesce(p_description, ''))),
      rules = public.orbit_clean(btrim(coalesce(p_rules, ''))), starts_at = p_starts,
      ends_at = p_ends, reg_closes_at = p_reg_closes, max_players = p_max,
      prize_text = public.orbit_clean(btrim(coalesce(p_prize_text, ''))),
      orbit_prizes = case when cur.prizes_paid then cur.orbit_prizes else coalesce(p_orbit_prizes, true) end,
      status = case when p_publish and cur.status = 'draft' then 'open' else cur.status end
    where id = v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.tournament_save(uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.tournament_save(uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,boolean,boolean) to authenticated;

-- Remove the obsolete overload that silently ignored the end date.
drop function if exists public.tournament_save(uuid,text,text,text,text,text,timestamptz,timestamptz,integer,text,boolean,boolean);

-- Game rounds are recorded only for signed-in, registered players and live
-- leaderboard tournaments for that EXACT game, inside the real play window.
-- Record the first score even if below the user's historical personal best;
-- only save later scores if they improve that tournament's best.
create or replace function public.tournament_record_score(p_game text, p_score bigint)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_count integer := 0; v_t record;
begin
  if v_user is null or not public.orbit_can_act() then return 0; end if;
  if p_game is null or not (p_game = any (public.tournament_games())) then return 0; end if;
  if p_score is null or p_score <= 0 or p_score > 1000000000 then return 0; end if;
  for v_t in
    select t.id from public.tournaments t
    join public.tournament_players p on p.tournament_id = t.id
    where t.game = p_game and t.format = 'leaderboard' and t.status = 'live'
      and p.user_id = v_user and p.status = 'registered'
      and now() >= greatest(t.starts_at, coalesce(t.started_at, t.starts_at), t.created_at, p.registered_at)
      and now() < t.ends_at
  loop
    if not exists (
      select 1 from public.tournament_scores s where s.tournament_id = v_t.id
        and s.user_id = v_user and s.status = 'approved' and s.score >= p_score
    ) then
      insert into public.tournament_scores (tournament_id,user_id,score,note,status)
      values (v_t.id,v_user,p_score,'Recorded from Orbit Games','approved');
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.tournament_record_score(text,bigint) from public, anon, authenticated;
grant execute on function public.tournament_record_score(text,bigint) to authenticated;

-- A typed score entered manually is NOT automatic: staff review it first.
create or replace function public.tournament_submit_score(p_id uuid, p_score bigint, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare t public.tournaments; v_join timestamptz;
begin
  if auth.uid() is null or not public.orbit_can_act() then raise exception 'You cannot submit a score right now.'; end if;
  select * into t from public.tournaments where id = p_id;
  if t.id is null or t.status <> 'live' or t.format <> 'leaderboard' then raise exception 'Scores are not being accepted for this tournament.'; end if;
  select registered_at into v_join from public.tournament_players where tournament_id = p_id and user_id = auth.uid() and status = 'registered';
  if v_join is null then raise exception 'You are not signed up for this tournament.'; end if;
  if now() < greatest(t.starts_at,coalesce(t.started_at,t.starts_at),v_join) or now() >= t.ends_at then raise exception 'The scoring window is not active.'; end if;
  if p_score is null or p_score < 0 or p_score > 1000000000 then raise exception 'That score is not valid.'; end if;
  if (select count(*) from public.tournament_scores where tournament_id = p_id and user_id = auth.uid() and status = 'pending') >= 5 then raise exception 'You already have 5 scores awaiting review.'; end if;
  insert into public.tournament_scores (tournament_id,user_id,score,note)
  values (p_id,auth.uid(),p_score,public.orbit_clean(left(btrim(coalesce(p_note,'')),200)));
end $$;
revoke all on function public.tournament_submit_score(uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.tournament_submit_score(uuid,bigint,text) to authenticated;

-- Rotate ONE weekly leaderboard contest through solo games. Create next week's
-- contest during the current week; start/close it on its scheduled dates. Do
-- NOT delete completed events (players' results and prizes need their history).
create or replace function private.tournament_rotation_tick()
returns void language plpgsql security invoker set search_path = '' as $$
declare v_week timestamptz := (date_trunc('week', now() at time zone 'America/New_York') + interval '7 days') at time zone 'America/New_York';
        v_games text[] := array['tetris','blockblast','snake','game2048','breakout','flappy','geodash','dino','pacman','slope','minesweeper','girder','sudoku'];
        v_index int; v_game text; v_title text; v_row public.tournaments; v_n int;
begin
  -- Finish elapsed generated events; never pay a second time.
  for v_row in select * from public.tournaments where auto_generated and status = 'live' and ends_at <= now() for update loop
    update public.tournament_players set placement = null where tournament_id = v_row.id;
    with best as (
      select distinct on (s.user_id) s.user_id, s.score, s.created_at
      from public.tournament_scores s join public.tournament_players p
        on p.tournament_id = s.tournament_id and p.user_id = s.user_id and p.status = 'registered'
      where s.tournament_id = v_row.id and s.status = 'approved'
        and s.created_at >= greatest(v_row.starts_at,coalesce(v_row.started_at,v_row.starts_at),p.registered_at)
        and s.created_at < v_row.ends_at
      order by s.user_id,s.score desc,s.created_at
    ), ranked as (select user_id,row_number() over (order by score desc,created_at) place from best)
    update public.tournament_players p set placement = ranked.place from ranked
    where p.tournament_id = v_row.id and p.user_id = ranked.user_id and ranked.place <= 3;
    update public.tournaments set status = 'completed' where id = v_row.id;
    perform public._t_pay(v_row.id);
  end loop;

  -- Start only scheduled auto-events with at least one registered player.
  for v_row in select * from public.tournaments where auto_generated and status = 'open' and starts_at <= now() for update loop
    select count(*) into v_n from public.tournament_players where tournament_id = v_row.id and status = 'registered';
    if v_n > 0 and now() < v_row.ends_at then
      update public.tournaments set status = 'live' where id = v_row.id;
    else
      update public.tournaments set status = 'cancelled' where id = v_row.id;
    end if;
  end loop;

  -- A partial unique index and ON CONFLICT make duplicate cron runs harmless.
  v_index := (floor(extract(epoch from v_week) / 604800)::integer % array_length(v_games,1)) + 1;
  v_game := v_games[v_index];
  v_title := 'Weekly ' || case v_game
    when 'tetris' then 'Tetris' when 'blockblast' then 'Block Blast' when 'snake' then 'Snake'
    when 'game2048' then '2048' when 'breakout' then 'Block Breaker' when 'flappy' then 'Flappy Bird'
    when 'geodash' then 'Geometry Dash' when 'dino' then 'Dino Run' when 'pacman' then 'Pac-Man'
    when 'slope' then 'Slope' when 'minesweeper' then 'Minesweeper' when 'girder' then 'Girder Gorilla'
    else 'Sudoku' end || ' Tournament';
  insert into public.tournaments
    (title,game,format,description,rules,starts_at,ends_at,reg_closes_at,max_players,prize_text,orbit_prizes,status,auto_generated)
  values (v_title,v_game,'leaderboard','Compete for the highest score in this week''s Orbit Games cartridge.',
    'Register before the start. Only rounds finished after the event starts and before it ends count. The best recorded score wins.',
    v_week,v_week + interval '7 days',v_week,64,'Weekly champion',true,'open',true)
  on conflict do nothing;
end $$;
revoke all on function private.tournament_rotation_tick() from public, anon, authenticated;

-- pg_cron already exists in Orbit's database. Five-minute maintenance keeps
-- week boundaries accurate without running any work in visitors' browsers.
select cron.schedule('orbit-weekly-tournament-rotation','*/5 * * * *','select private.tournament_rotation_tick();');

commit;
