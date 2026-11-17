-- #gms: read-only AI-written recaps of the official Good Morning 'Stoga livestream.
ALTER TABLE public.channels DROP CONSTRAINT IF EXISTS channels_special_check;
ALTER TABLE public.channels ADD CONSTRAINT channels_special_check
  CHECK (special IS NULL OR special IN ('suggestions', 'videos', 'gms'));

CREATE TABLE IF NOT EXISTS public.gms_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text NOT NULL UNIQUE CHECK (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text NOT NULL CHECK (length(btrim(title)) > 0),
  published_on date NOT NULL,
  summary text NOT NULL CHECK (length(btrim(summary)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gms_posts_latest_idx ON public.gms_posts (published_on DESC, created_at DESC);
ALTER TABLE public.gms_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gms_posts FROM anon, authenticated;
GRANT SELECT ON public.gms_posts TO authenticated;
GRANT ALL ON public.gms_posts TO service_role;
DROP POLICY IF EXISTS gms_read ON public.gms_posts;
CREATE POLICY gms_read ON public.gms_posts
  FOR SELECT TO authenticated USING (public.server_role(public.main_server()) IS NOT NULL);

-- Prevent even the server owner from using the ordinary chat composer/API
-- to publish in this dedicated digest channel. Only backend service-role
-- publishing to gms_posts is permitted.
CREATE OR REPLACE FUNCTION public.can_post(cid uuid)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.channels; sm public.server_members;
BEGIN
  SELECT * INTO c FROM public.channels WHERE id = cid;
  IF c.id IS NULL OR c.kind <> 'text' OR c.special = 'gms' THEN RETURN false; END IF;
  SELECT * INTO sm FROM public.server_members WHERE server_id = c.server_id AND user_id = auth.uid();
  IF sm.user_id IS NULL THEN RETURN false; END IF;
  IF NOT public.can_read_channel(cid) THEN RETURN false; END IF;
  IF c.owner_only AND NOT (sm.role = 'owner' OR (c.admins_can_post AND sm.role = 'admin') OR (c.mods_can_post AND sm.role IN ('admin', 'moderator'))) THEN RETURN false; END IF;
  IF sm.timeout_until IS NOT NULL AND sm.timeout_until > now() THEN RETURN false; END IF;
  IF c.locked AND NOT (sm.role = 'owner' OR public.has_perm('lock_channels')) THEN RETURN false; END IF;
  RETURN true;
END
$function$;

INSERT INTO public.channels (
  server_id, category_id, name, description, kind, is_private, position,
  locked, owner_only, admins_can_post, mods_can_post, special
)
SELECT s.id,
       (SELECT category_id FROM public.channels WHERE server_id = s.id AND name = 'tutorials' LIMIT 1),
       'gms',
       'Daily AI-written summaries of official T/E TV Good Morning ’Stoga livestreams. Read-only for members.',
       'text',
       false,
       (SELECT COALESCE(MAX(position) + 1, 10) FROM public.channels WHERE server_id = s.id),
       true, true, false, false, 'gms'
FROM public.servers s
WHERE s.id = public.main_server()
  AND NOT EXISTS (SELECT 1 FROM public.channels c WHERE c.server_id = s.id AND c.name = 'gms');

-- Seed only the latest verified official GMS broadcast, as aired on November 13.
-- Date verified on the TETV video's expanded YouTube details page.
INSERT INTO public.gms_posts (video_id, title, published_on, summary)
VALUES (
  'warPqfgGqE0',
  'Good Morning ''Stoga — November 13, 2026',
  DATE '2026-11-13',
  E'Schedule: Friday followed the gray eight-period schedule.\nGiving back: TE Cares is collecting cleaning supplies in the main lobby, bus circle, and Room 208 before Thanksgiving break. The school-wide canned-food drive is accepting donations through homerooms for the Great Valley Food Cupboard, with a goal of 3,000 cans.\nClass T-shirts: Seniors should submit Class of 2027 shirt designs to Mr. Shaw before Thanksgiving break; freshmen can email their class shirt designs by December 1.\nClubs and Mini-THON: A 5K run and one-mile walk are planned at Wilson Farm Park the following weekend, with shirts for the first 200 participants. The student-versus-faculty volleyball game is November 18 at 3:30 p.m. in the large gym; tickets cost $5 at lunch. Creative Writing Club meets Monday in Room 245A until 3:30 p.m.\nSports: Boys soccer was scheduled to face Northampton in the state quarterfinals at Boyertown on November 14 at 2 p.m.; girls volleyball was scheduled to play Hempfield at Exeter High School at 4 p.m. The broadcast also featured Conestoga cross-country athletes, including the girls team''s top-ten state finish and a profile of the team''s perseverance and sportsmanship.\nWeather and lunch: The forecast called for a cooler but relatively sunny weekend. Friday''s lunch featured pizza dippers.'
)
ON CONFLICT (video_id) DO NOTHING;
