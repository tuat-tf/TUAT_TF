-- Mark a competition's live results as finished (owner request 2026-10-26): the scheduled import
-- skips it and home shows the competition as finished. NULL = still importing in its date window.
-- The imported program and results are kept. Idempotent.
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS program_closed_at timestamptz;

NOTIFY pgrst, 'reload schema';
