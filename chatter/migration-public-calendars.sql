-- Orbit: public role-labelled calendar imports and one class per subject.
UPDATE public.class_roles
SET exclusive_group = CASE
 WHEN subject IN ('Algebra I','Geometry','Algebra II','Math Analysis') THEN 'math'
 WHEN subject ~* '^(Spanish|French)([[:space:]]|$)' OR subject IN ('Latin','German','Italian') THEN 'world languages'
 WHEN subject IN ('Biology','Literary Foundations','World History','CSA','CSP') THEN lower(subject)
 ELSE exclusive_group
END
WHERE subject IN ('Algebra I','Geometry','Algebra II','Math Analysis','Latin','German','Italian','Biology','Literary Foundations','World History','CSA','CSP')
 OR subject ~* '^(Spanish|French)([[:space:]]|$)';

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS class_role_id uuid REFERENCES public.class_roles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS class_role_label text,
  ADD COLUMN IF NOT EXISTS imported_by uuid;
CREATE UNIQUE INDEX IF NOT EXISTS events_public_class_unique
  ON public.events(class_role_id, starts_at, ends_at, lower(title))
  WHERE class_role_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.import_class_calendar(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_item jsonb;
  v_role uuid;
  v_title text;
  v_start timestamptz;
  v_end timestamptz;
  v_label text;
  v_created uuid;
  v_inserted int := 0;
  v_existing int;
BEGIN
  IF v_user IS NULL OR NOT public.orbit_can_act() THEN
    RAISE EXCEPTION 'You must be a signed-in Orbit member to add a calendar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_role_members m WHERE m.user_id=v_user) THEN
    RAISE EXCEPTION 'Choose your roles in the Roles tab before importing a calendar.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.class_role_members m JOIN public.class_roles r ON r.id=m.role_id
    WHERE m.user_id=v_user AND r.exclusive_group IS NOT NULL
    GROUP BY lower(r.exclusive_group) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'You have conflicting class roles. Choose only one math, one world language, and one level per subject before importing.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 500 THEN
    RAISE EXCEPTION 'Import one to 500 calendar entries at a time.';
  END IF;
  SELECT count(*) INTO v_existing FROM public.events
    WHERE imported_by=v_user AND created_at >= now() - interval '24 hours';
  IF v_existing + jsonb_array_length(p_items) > 600 THEN
    RAISE EXCEPTION 'Daily calendar import limit reached. Try again later.';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) AS t(value) LOOP
    IF jsonb_typeof(v_item) <> 'object' OR coalesce(v_item->>'role_id','') !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      RAISE EXCEPTION 'Each event needs a valid selected role.';
    END IF;
    v_role := (v_item->>'role_id')::uuid;
    SELECT r.subject || coalesce(' ('||r.level||')','') INTO v_label
      FROM public.class_roles r JOIN public.class_role_members m ON m.role_id=r.id
      WHERE r.id=v_role AND m.user_id=v_user;
    IF v_label IS NULL THEN
      RAISE EXCEPTION 'An event uses a role you have not chosen.';
    END IF;
    v_title := btrim(regexp_replace(coalesce(v_item->>'title',''),'[[:cntrl:]]',' ','g'));
    IF char_length(v_title) < 1 OR char_length(v_title) > 100 THEN
      RAISE EXCEPTION 'Event names must contain one to 100 characters.';
    END IF;
    v_start := (v_item->>'starts_at')::timestamptz;
    v_end := (v_item->>'ends_at')::timestamptz;
    IF v_start IS NULL OR v_end IS NULL OR v_start < now() - interval '7 days'
       OR v_start > now() + interval '300 days'
       OR v_end <= v_start OR v_end > v_start + interval '24 hours' THEN
      RAISE EXCEPTION 'Event dates must be within the next 300 days, with a duration up to 24 hours.';
    END IF;
    v_created := NULL;
    INSERT INTO public.events(title, description, kind, host_id, starts_at, ends_at,
       location, board_id, created_by, class_role_id, class_role_label, imported_by)
    VALUES (v_title, '', 'other', NULL, v_start, v_end, '', NULL,
       v_user, v_role, v_label, v_user)
    ON CONFLICT DO NOTHING RETURNING id INTO v_created;
    IF v_created IS NOT NULL THEN v_inserted := v_inserted + 1; END IF;
  END LOOP;
  RETURN v_inserted;
END $function$;

REVOKE ALL ON FUNCTION public.import_class_calendar(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_class_calendar(jsonb) TO authenticated;

SELECT
  (SELECT count(*) FROM public.class_roles WHERE exclusive_group='math') AS grouped_math,
  (SELECT count(*) FROM public.class_roles WHERE exclusive_group='world languages') AS grouped_world_languages,
  (SELECT count(*) FROM public.class_roles WHERE exclusive_group IS NULL) AS ungrouped_roles,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name='class_role_id') AS imported_event_column,
  (SELECT has_function_privilege('authenticated', 'public.import_class_calendar(jsonb)', 'EXECUTE')) AS authenticated_can_import,
  (SELECT has_function_privilege('anon', 'public.import_class_calendar(jsonb)', 'EXECUTE')) AS anon_can_import;

-- Assign subject groups to future class roles automatically.
CREATE OR REPLACE FUNCTION public.class_roles_infer_exclusive_group()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $function$
BEGIN
  IF NEW.exclusive_group IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.subject ~* '^(Algebra[[:space:]]+[IVX0-9]+|Geometry|Math Analysis)$' THEN
    NEW.exclusive_group := 'math';
  ELSIF NEW.subject ~* '^(Spanish|French|Latin|German|Italian)([[:space:]]+[IVX0-9]+)?$' THEN
    NEW.exclusive_group := 'world languages';
  ELSIF NEW.level IS NOT NULL AND char_length(NEW.subject) <= 40 THEN
    NEW.exclusive_group := lower(NEW.subject);
  ELSE
    SELECT r.exclusive_group INTO NEW.exclusive_group
    FROM public.class_roles r WHERE lower(r.subject)=lower(NEW.subject)
      AND r.exclusive_group IS NOT NULL AND r.id IS DISTINCT FROM NEW.id LIMIT 1;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS class_roles_infer_exclusive_group_trigger ON public.class_roles;
CREATE TRIGGER class_roles_infer_exclusive_group_trigger
BEFORE INSERT OR UPDATE OF subject,level,exclusive_group ON public.class_roles
FOR EACH ROW EXECUTE FUNCTION public.class_roles_infer_exclusive_group();
SELECT t.tgname FROM pg_trigger t WHERE t.tgrelid='public.class_roles'::regclass AND t.tgname='class_roles_infer_exclusive_group_trigger';