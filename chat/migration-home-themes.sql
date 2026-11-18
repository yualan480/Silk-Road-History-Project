-- Run in the Orbit Supabase SQL Editor after migration-shop-v2.sql.
-- Adds a separate theme slot; profile themes remain independently equipped.
begin;
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check
  check(kind in ('frame','trail','theme','companion','collectible','cursor','font','orbit_theme'));
alter table public.shop_items drop constraint if exists orbit_home_theme_min_price;
alter table public.shop_items add constraint orbit_home_theme_min_price
  check(kind <> 'orbit_theme' or price >= 10000);
insert into public.shop_items(id,name,kind,rarity,price,blurb,art,sort,active) values
 ('home_aurora','Aurora','orbit_theme','epic',10000,'Emerald skies and cool mint accents.','{"c1":"#3ee6b0","c2":"#116951","home":"aurora"}',901,true),
 ('home_sunset','Solar Sunset','orbit_theme','epic',12000,'Warm amber light and coral highlights.','{"c1":"#ffc775","c2":"#903a29","home":"sunset"}',902,true),
 ('home_rose','Rose Nebula','orbit_theme','legendary',15000,'Pink nebula clouds and violet panels.','{"c1":"#f6adf1","c2":"#743a86","home":"rose"}',903,true),
 ('home_arctic','Arctic','orbit_theme','epic',10000,'Icy blue light with soft silver accents.','{"c1":"#c5f3ff","c2":"#28657b","home":"arctic"}',904,true)
on conflict(id) do update set name=excluded.name,kind=excluded.kind,rarity=excluded.rarity,price=excluded.price,blurb=excluded.blurb,art=excluded.art,sort=excluded.sort,active=excluded.active;
commit;
-- buy_shop_item validates the catalog price, locks spending, debits the ledger,
-- and grants ownership atomically. equip_shop_item checks ownership and equips
-- one item per kind, so no additional writable tables or client grants are needed.
