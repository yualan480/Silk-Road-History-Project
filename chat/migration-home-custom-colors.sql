-- Run AFTER migration-home-themes.sql. Safe to run again.
-- A new saved palette costs exactly 20,000 Orbits. Owned palettes reapply free.
begin;
create or replace function public.buy_home_color_theme(p_primary text,p_secondary text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid();c1 text:=lower(p_primary);c2 text:=lower(p_secondary);iid text;bal bigint;
begin
 if uid is null then raise exception 'Log in to Orbit first.';end if;
 if c1 is null or c2 is null or c1 !~ '^#[0-9a-f]{6}$' or c2 !~ '^#[0-9a-f]{6}$' then raise exception 'Choose two valid colors.';end if;
 iid:='hc_'||left(md5(uid::text||':'||c1||':'||c2),21);
 perform pg_advisory_xact_lock(hashtext('orbit-spend-'||uid::text));
 select coalesce(sum(amount),0) into bal from orbit_ledger where user_id=uid;
 if not exists(select 1 from shop_inventory where user_id=uid and item_id=iid) then
  if bal<20000 then raise exception 'Custom Orbit colors cost 20,000 Orbits.';end if;
  insert into shop_items(id,name,kind,rarity,price,blurb,art,active,sort)
   values(iid,'Custom Orbit colors','orbit_theme','legendary',20000,'A personal Orbit color palette.',jsonb_build_object('home','custom','c1',c1,'c2',c2),true,950)
   on conflict(id) do nothing;
  insert into orbit_ledger(user_id,amount,reason,ref) values(uid,-20000,'spend','shop:'||iid);
  insert into shop_inventory(user_id,item_id,equipped) values(uid,iid,false);
  bal:=bal-20000;
 end if;
 perform public.equip_shop_item(iid,true);
 return jsonb_build_object('balance',bal,'item_id',iid);
end $$;
revoke all on function public.buy_home_color_theme(text,text) from public,anon;
grant execute on function public.buy_home_color_theme(text,text) to authenticated;
commit;
