-- 大会の目標で、種目マスタに無い種目も「その他」で自由に入力できるようにする。
-- 目標の種目名はマスタへの外部キーをやめ、マスタの改名は結果と同じくトリガーで追従させる。
ALTER TABLE public.competition_goals DROP CONSTRAINT IF EXISTS competition_goals_event_fkey;

CREATE OR REPLACE FUNCTION public.competition_events_rename()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- PC→クラウドの写しでは、PCの値をそのまま再現する（クラウド側で値を変えたり副作用を起こしたりしない）。
  IF public.is_mirror_write() THEN RETURN NEW; END IF;
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE public.pb_records SET event_name = NEW.name WHERE event_name = OLD.name;
    UPDATE public.competition_goals SET event = NEW.name WHERE event = OLD.name;
  END IF;
  RETURN NULL;
END $function$;

NOTIFY pgrst,'reload schema';
