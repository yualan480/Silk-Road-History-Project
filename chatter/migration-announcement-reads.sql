-- Acknowledgments are opt-in: opening an announcement never marks it read.
-- Only the recipient can acknowledge their own read; only Orbit staff can view others.
create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists announcement_reads_user_id_idx
  on public.announcement_reads (user_id);

alter table public.announcement_reads enable row level security;

create policy "announcement_reads_view"
  on public.announcement_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.orbit_staff())
  );

create policy "announcement_reads_acknowledge"
  on public.announcement_reads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select public.orbit_can_act())
  );

revoke all on public.announcement_reads from anon, authenticated;
grant select on public.announcement_reads to authenticated;
grant insert (announcement_id, user_id) on public.announcement_reads to authenticated;
