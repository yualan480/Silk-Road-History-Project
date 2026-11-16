-- Permit .mov (QuickTime) tutorial videos without changing author/role rules.
CREATE OR REPLACE FUNCTION public.add_tutorial(p_title text, p_game text, p_video jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t text := btrim(coalesce(p_title, '')); g text := btrim(coalesce(p_game, '')); cid uuid; pth text; tid uuid;
begin
  if auth.uid() is null or public.server_role(public.main_server()) is null then raise exception 'Join the server first.'; end if;
  if char_length(t) < 3 or char_length(t) > 100 then raise exception 'The title must be 3 to 100 characters.'; end if;
  if char_length(g) > 40 then raise exception 'The game name can be at most 40 characters.'; end if;
  select id into cid from channels where special = 'videos' order by created_at limit 1;
  if cid is null then raise exception 'The tutorials page is not set up yet.'; end if;
  pth := coalesce(p_video->>'path', '');
  if coalesce(p_video->>'type', '') not in ('video/mp4', 'video/webm', 'video/quicktime') then raise exception 'Only mp4, webm or mov videos can be added.'; end if;
  if pth not like cid::text || '/' || auth.uid()::text || '/%' then raise exception 'That video was not uploaded correctly. Try again.'; end if;
  if not public.is_owner() and (select count(*) from tutorials where author_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You can add up to 10 tutorials a day. Try again tomorrow.';
  end if;
  insert into tutorials (author_id, title, game, video)
    values (auth.uid(), t, g, jsonb_build_object('path', pth, 'name', left(coalesce(p_video->>'name', 'tutorial'), 120), 'type', p_video->>'type', 'size', coalesce((p_video->>'size')::bigint, 0)))
    returning id into tid;
  return tid;
end $function$
;

-- Match the existing 50 MB upload limit presented in Orbit's UI.
update storage.buckets
set allowed_mime_types = case when 'video/quicktime' = any(coalesce(allowed_mime_types, '{}'::text[]))
      then allowed_mime_types else array_append(coalesce(allowed_mime_types, '{}'::text[]), 'video/quicktime') end,
    file_size_limit = greatest(coalesce(file_size_limit, 0), 52428800)
where id = 'attachments';
