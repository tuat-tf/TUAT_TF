-- Apply the unpublished contact change after the current production migration chain.
-- A present attendee may leave a general contact note without being late.
-- Preserve existing notes, dates, owner RLS, and the present/absent invariants.
ALTER TABLE public.attendances DROP CONSTRAINT IF EXISTS attendances_note_requires_late;
NOTIFY pgrst, 'reload schema';
