-- Run in the GAMES Supabase project (ysopxengerkvbwhrdnwq), SQL Editor.
-- Removes old 10-million validation ceilings without touching earned rows,
-- game/name/account permissions, allowed-game lists or leaderboard views.
-- The existing SQL integer type's 2,147,483,647 maximum still applies.
-- Also updates recording metadata if this project has that table.
begin;
do $$
declare t text; c record; p record; definition text; score_column smallint; relation regclass;
begin
  if to_regclass('public.scores') is null then raise exception 'Run this file in the GAMES Supabase project (ysopxengerkvbwhrdnwq), which owns public.scores.'; end if;
  foreach t in array array['scores','recordings'] loop
    relation:=to_regclass('public.'||t);
    if relation is null then continue; end if;
    select attnum into score_column from pg_attribute where attrelid=relation and attname='score' and not attisdropped;
    if score_column is null then continue; end if;
    for c in select conname,pg_get_constraintdef(oid) as definition from pg_constraint
      where conrelid=relation and contype='c' and score_column=any(conkey) loop
      if c.definition ~ '\m10000000\M' then
        definition:=regexp_replace(c.definition,'\m10000000\M','2147483647','g');
        execute format('alter table %s drop constraint %I',relation,c.conname);
        execute format('alter table %s add constraint %I %s',relation,c.conname,definition);
      end if;
    end loop;
    for p in select polname,pg_get_expr(polqual,polrelid) as using_expr,pg_get_expr(polwithcheck,polrelid) as check_expr
      from pg_policy where polrelid=relation loop
      if coalesce(p.using_expr,'') ~ '\mscore\M' and p.using_expr ~ '\m10000000\M' then
        execute format('alter policy %I on %s using (%s)',p.polname,relation,regexp_replace(p.using_expr,'\m10000000\M','2147483647','g'));
      end if;
      if coalesce(p.check_expr,'') ~ '\mscore\M' and p.check_expr ~ '\m10000000\M' then
        execute format('alter policy %I on %s with check (%s)',p.polname,relation,regexp_replace(p.check_expr,'\m10000000\M','2147483647','g'));
      end if;
    end loop;
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
-- Scores previously uploaded as 10,000,000 cannot be reconstructed from that
-- clipped value. A new genuine score will upload at its real value.
