-- 流しを本数（整数）から「100m×3」のような自由な文字列へ変える。
-- 以前の 0 は「入力なし」だったので NULL にし、それ以外の本数は同じ数字の文字列として残す。
-- すでに text の環境では何もしない（冪等）。
DO $$
BEGIN
  IF (
    SELECT data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'practice_records' AND column_name = 'strides'
  ) IS DISTINCT FROM 'text' THEN
    ALTER TABLE public.practice_records ALTER COLUMN strides DROP DEFAULT;
    ALTER TABLE public.practice_records
      ALTER COLUMN strides TYPE text USING NULLIF(strides, 0)::text;
  END IF;
END;
$$;

-- 空でない流しの文字列を中身として数える（数値の比較は text 列では使えない）。
CREATE OR REPLACE FUNCTION public.record_has_content(public.practice_records)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    COALESCE($1.dist_low, 0) > 0 OR COALESCE($1.dist_mid, 0) > 0
    OR COALESCE($1.dist_high, 0) > 0 OR COALESCE($1.dist_speed, 0) > 0
    OR COALESCE($1.dist_actual, 0) > 0
    OR EXISTS (
      SELECT 1 FROM unnest(ARRAY[
        $1.strides, $1.result_text, $1.strength_text, $1.memo, $1.menu_text, $1.focus_text,
        $1.condition::text
      ]) AS field(value)
      WHERE COALESCE(field.value, '') ~ '[^[:space:]]'
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_each_text(
        CASE WHEN jsonb_typeof($1.custom) = 'object' THEN $1.custom ELSE '{}'::jsonb END
      ) AS field(key, value)
      WHERE COALESCE(field.value, '') ~ '[^[:space:]]'
        AND field.value !~ '^[[:space:]]*[+-]?0+(\.0+)?[[:space:]]*$'
    );
$$;

-- Regression fixtures use composite values only: no production rows are written.
DO $$
BEGIN
  IF public.record_has_content(jsonb_populate_record(NULL::public.practice_records, '{"strides":"  "}'::jsonb)) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Blank strides must not count as content';
  END IF;
  IF public.record_has_content(jsonb_populate_record(NULL::public.practice_records, '{"strides":"100m×3"}'::jsonb)) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Written strides must count as content';
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
