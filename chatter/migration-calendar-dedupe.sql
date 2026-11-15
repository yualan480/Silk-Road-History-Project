-- Orbit public calendar: treat the same role, period and normalized title
-- as one shared event even when different ICS files use different UIDs,
-- capitalization, punctuation or spacing.
-- This complements events_public_class_unique (the exact-title index).
-- Keep the end time in the key: genuinely different event times must not merge.
CREATE UNIQUE INDEX IF NOT EXISTS events_public_class_trimmed_unique
ON public.events (
  class_role_id,
  starts_at,
  ends_at,
  lower(btrim(regexp_replace(title, '[^[:alnum:]]+', ' ', 'g')))
)
WHERE class_role_id IS NOT NULL;

-- import_class_calendar already inserts with ON CONFLICT DO NOTHING,
-- so a repeated import automatically retains the one existing public event.
-- This index also covers concurrent imports by different users.
