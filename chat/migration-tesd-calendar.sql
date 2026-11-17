-- Dedicated reference channel for the official 2026–2027 TESD calendar.
-- Content is served as a read-only PDF page in the Orbit client, not as chat messages.
-- Safe to run again: this only creates the channel if missing.
INSERT INTO public.channels (
  server_id, category_id, name, description, kind, is_private,
  position, locked, owner_only, admins_can_post, mods_can_post
)
SELECT
  s.id, g.category_id, 'tesd-calendar',
  'Official Tredyffrin/Easttown School District 2026–2027 calendar. View the original PDF.',
  'text', false,
  (SELECT COALESCE(MAX(c.position) + 1, 0)
     FROM public.channels c
    WHERE c.server_id = s.id
      AND c.category_id IS NOT DISTINCT FROM g.category_id),
  true, true, false, false
FROM public.servers s
CROSS JOIN LATERAL (
  SELECT category_id FROM public.channels
   WHERE server_id = s.id AND name = 'gms'
   LIMIT 1
) AS g
WHERE s.id = public.main_server()
  AND NOT EXISTS (
    SELECT 1 FROM public.channels e
     WHERE e.server_id = s.id AND e.name = 'tesd-calendar'
  );
