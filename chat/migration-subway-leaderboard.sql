-- Run once in the Orbit Supabase SQL Editor. Safe to run again.
-- Real Orbit accounts only. No anonymous submissions or changes to Orbits payouts.
begin;
create table if not exists public.subway_scores(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 score bigint not null check(score between 1 and 2147483647),
 achieved_at timestamptz not null default now()
);
create index if not exists subway_scores_ranking on public.subway_scores(score desc,achieved_at,user_id);
alter table public.subway_scores enable row level security;
revoke all on public.subway_scores from public,anon,authenticated;
create or replace function public.submit_subway_score(p_score bigint)
returns bigint language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); best bigint;
begin
 if uid is null or not exists(select 1 from profiles where id=uid) then raise exception 'Log in to Orbit first.';end if;
 if p_score is null or p_score<1 or p_score>2147483647 then raise exception 'Invalid score.';end if;
 insert into subway_scores(user_id,score) values(uid,p_score)
 on conflict(user_id) do update set
 achieved_at=case when excluded.score>subway_scores.score then now() else subway_scores.achieved_at end,
 score=greatest(subway_scores.score,excluded.score)
 returning score into best;
 return best;
end $$;
drop function if exists public.get_subway_leaderboard(int);
create function public.get_subway_leaderboard(p_limit int default 11)
returns table(user_id uuid,name text,score bigint,rank bigint,avatar_url text,avatar_color text)
language plpgsql stable security definer set search_path=public as $$
declare uid uuid:=auth.uid(); lim int:=greatest(1,least(coalesce(p_limit,11),50));
begin
 if uid is null or not exists(select 1 from profiles where id=uid) then raise exception 'Log in to Orbit first.';end if;
 return query
 with ranked as (
  select s.user_id,coalesce(nullif(btrim(concat_ws(' ',nullif(btrim(p.first_name),''),nullif(btrim(p.last_name),''))),''),nullif(p.display_name,''),p.username)::text as name,s.score,
   row_number() over(order by s.score desc,s.achieved_at,s.user_id) as rank,p.avatar_url,p.avatar_color
  from subway_scores s join profiles p on p.id=s.user_id
 ), mine as(select r.rank from ranked r where r.user_id=uid)
 select r.user_id,r.name,r.score,r.rank,r.avatar_url,r.avatar_color from ranked r
 where r.rank<=lim-case when exists(select 1 from mine where mine.rank>lim) then 1 else 0 end or r.user_id=uid
 order by r.rank;
end $$;
revoke all on function public.submit_subway_score(bigint),public.get_subway_leaderboard(int) from public,anon;
grant execute on function public.submit_subway_score(bigint),public.get_subway_leaderboard(int) to authenticated;
commit;
