-- 学祭ページを部員へ広げる（2026-11-13 所有者の指示）。
--   ロールに2つの権限を足し、ロール管理の画面で付け外しできるようにする。
--   ・can_use_festival（学祭）: ページを使う。売上の入力・材料・買い出し・指示の確認。指示と買い出しの募集が通知される。
--   ・can_manage_festival（学祭の店長）: 今日の売上・過去の売上をすべて見る。指示を出す・直す・消す。
--     店長の権限だけのロールでもページは使える。ほかの人が見られる売上は直近1時間だけ。
--   ロール「学祭」「学祭店長2026」を作ってそれぞれに付ける。いままで使っていたシステム管理のロールには「学祭」を付ける。
--   あわせて、材料の残りの変更を記録し、「使った」記録は売上と同じように取り消せるようにする。
-- 再実行しても同じ状態になる（冪等）。

-- 1. 権限の列とロール。ロールの変更を守るトリガーを通すため、この塊だけ service_role として書く。
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'can_use_festival') THEN
    ALTER TABLE public.roles ADD COLUMN can_use_festival boolean NOT NULL DEFAULT false;
    -- 列を足したときだけ、いままで使えたシステム管理のロールに付ける（あとで外しても、再実行で戻さない）。
    UPDATE public.roles SET can_use_festival = true WHERE can_manage_system;
  END IF;
  ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS can_manage_festival boolean NOT NULL DEFAULT false;

  INSERT INTO public.roles (name, color, category, sort_order, can_use_festival, can_manage_festival)
  SELECT v.name, v.color, '2026', (SELECT coalesce(max(sort_order), 0) FROM public.roles) + v.ord, true, v.manage
  FROM (VALUES ('学祭', '#ff9500', 1, false), ('学祭店長2026', '#ff3b30', 2, true)) AS v(name, color, ord, manage)
  WHERE NOT EXISTS (SELECT 1 FROM public.roles r WHERE r.name = v.name)
  ORDER BY v.ord;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- 2. 判定（ほかの権限と同じく、「全員」ロールに付けたら全員が持つ）
CREATE OR REPLACE FUNCTION public.festival_is_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.roles r WHERE r.can_manage_festival AND
      (r.is_everyone OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.role_id = r.id AND pr.profile_id = auth.uid()))
  );
$$;
CREATE OR REPLACE FUNCTION public.festival_is_member()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.roles r WHERE (r.can_use_festival OR r.can_manage_festival) AND
      (r.is_everyone OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.role_id = r.id AND pr.profile_id = auth.uid()))
  );
$$;
REVOKE ALL ON FUNCTION public.festival_is_manager(), public.festival_is_member() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.festival_is_manager(), public.festival_is_member() TO authenticated;

-- 3. 読み書きの権限を差し替える
DROP POLICY IF EXISTS festival_stock_items_all ON public.festival_stock_items;
CREATE POLICY festival_stock_items_all ON public.festival_stock_items FOR ALL TO authenticated
  USING (public.festival_is_member()) WITH CHECK (public.festival_is_member());
DROP POLICY IF EXISTS festival_shopping_trips_all ON public.festival_shopping_trips;
CREATE POLICY festival_shopping_trips_all ON public.festival_shopping_trips FOR ALL TO authenticated
  USING (public.festival_is_member()) WITH CHECK (public.festival_is_member());

DROP POLICY IF EXISTS festival_instructions_all ON public.festival_instructions;
DROP POLICY IF EXISTS festival_instructions_read ON public.festival_instructions;
CREATE POLICY festival_instructions_read ON public.festival_instructions FOR SELECT TO authenticated
  USING (public.festival_is_member());
DROP POLICY IF EXISTS festival_instructions_write ON public.festival_instructions;
CREATE POLICY festival_instructions_write ON public.festival_instructions FOR ALL TO authenticated
  USING (public.festival_is_manager()) WITH CHECK (public.festival_is_manager());

DROP POLICY IF EXISTS festival_shopping_members_read ON public.festival_shopping_members;
CREATE POLICY festival_shopping_members_read ON public.festival_shopping_members FOR SELECT TO authenticated
  USING (public.festival_is_member());
DROP POLICY IF EXISTS festival_shopping_members_insert ON public.festival_shopping_members;
CREATE POLICY festival_shopping_members_insert ON public.festival_shopping_members FOR INSERT TO authenticated
  WITH CHECK (public.festival_is_member() AND user_id = auth.uid());
DROP POLICY IF EXISTS festival_shopping_members_delete ON public.festival_shopping_members;
CREATE POLICY festival_shopping_members_delete ON public.festival_shopping_members FOR DELETE TO authenticated
  USING (public.festival_is_member() AND user_id = auth.uid());

DROP POLICY IF EXISTS festival_instruction_acks_read ON public.festival_instruction_acks;
CREATE POLICY festival_instruction_acks_read ON public.festival_instruction_acks FOR SELECT TO authenticated
  USING (public.festival_is_member());
DROP POLICY IF EXISTS festival_instruction_acks_insert ON public.festival_instruction_acks;
CREATE POLICY festival_instruction_acks_insert ON public.festival_instruction_acks FOR INSERT TO authenticated
  WITH CHECK (public.festival_is_member() AND user_id = auth.uid());
DROP POLICY IF EXISTS festival_instruction_acks_delete ON public.festival_instruction_acks;
CREATE POLICY festival_instruction_acks_delete ON public.festival_instruction_acks FOR DELETE TO authenticated
  USING (public.festival_is_member() AND user_id = auth.uid());

-- 売上: 店長はすべて、ほかの人は直近1時間だけ読める・取り消せる。売った時刻は入れたときの時刻だけ。
DROP POLICY IF EXISTS festival_sales_read ON public.festival_sales;
CREATE POLICY festival_sales_read ON public.festival_sales FOR SELECT TO authenticated
  USING (public.festival_is_manager() OR (public.festival_is_member() AND sold_at > now() - interval '1 hour'));
DROP POLICY IF EXISTS festival_sales_insert ON public.festival_sales;
CREATE POLICY festival_sales_insert ON public.festival_sales FOR INSERT TO authenticated
  WITH CHECK (public.festival_is_member() AND recorded_by = auth.uid()
    AND sold_at BETWEEN now() - interval '5 minutes' AND now() + interval '5 minutes');
DROP POLICY IF EXISTS festival_sales_delete ON public.festival_sales;
CREATE POLICY festival_sales_delete ON public.festival_sales FOR DELETE TO authenticated
  USING (public.festival_is_manager() OR (public.festival_is_member() AND sold_at > now() - interval '1 hour'));

-- 4. 材料の残りの変更記録。use は「使った」（取り消せる）、set は足した・数え直した。
--    書き込みは下のトリガーと関数だけが行う。
CREATE TABLE IF NOT EXISTS public.festival_stock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.festival_stock_items(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('use', 'set')),
  delta integer NOT NULL,
  count_after integer NOT NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS festival_stock_events_item_idx ON public.festival_stock_events (item_id, created_at DESC, id);
ALTER TABLE public.festival_stock_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS festival_stock_events_read ON public.festival_stock_events;
CREATE POLICY festival_stock_events_read ON public.festival_stock_events FOR SELECT TO authenticated
  USING (public.festival_is_member());
REVOKE ALL ON public.festival_stock_events FROM anon, authenticated;
GRANT SELECT ON public.festival_stock_events TO authenticated;

CREATE OR REPLACE FUNCTION public.festival_log_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kind text := coalesce(nullif(current_setting('festival.stock_kind', true), ''), 'set');
BEGIN
  IF v_kind = 'skip' OR (TG_OP = 'UPDATE' AND NEW.count = OLD.count) THEN RETURN NEW; END IF;
  INSERT INTO public.festival_stock_events (item_id, kind, delta, count_after, actor_id)
  VALUES (NEW.id, v_kind, NEW.count - CASE WHEN TG_OP = 'INSERT' THEN 0 ELSE OLD.count END, NEW.count, auth.uid());
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.festival_log_stock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS festival_stock_items_log ON public.festival_stock_items;
CREATE TRIGGER festival_stock_items_log AFTER INSERT OR UPDATE OF count ON public.festival_stock_items
  FOR EACH ROW EXECUTE FUNCTION public.festival_log_stock();

-- 使った数を減らす（記録は use）。権限がない・範囲外なら NULL。
CREATE OR REPLACE FUNCTION public.festival_adjust_stock(p_item_id uuid, p_delta integer)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  PERFORM set_config('festival.stock_kind', 'use', true);
  UPDATE public.festival_stock_items
  SET count = count + p_delta, updated_by = auth.uid(), updated_at = now()
  WHERE id = p_item_id AND count + p_delta BETWEEN 0 AND 9999
  RETURNING count INTO v_count;
  PERFORM set_config('festival.stock_kind', '', true);
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.festival_adjust_stock(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.festival_adjust_stock(uuid, integer) TO authenticated;

-- 「使った」記録を取り消して、数を戻す。そのあとに数え直した記録は取り消せない（数え直しに含まれているため）。
-- 取り消せないときは NULL（何も変えない）。
CREATE OR REPLACE FUNCTION public.festival_undo_stock_event(p_event_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item uuid; v_delta integer; v_count integer;
BEGIN
  IF NOT public.festival_is_member() THEN RETURN NULL; END IF;
  DELETE FROM public.festival_stock_events e
  WHERE e.id = p_event_id AND e.kind = 'use'
    AND NOT EXISTS (SELECT 1 FROM public.festival_stock_events s
                    WHERE s.item_id = e.item_id AND s.kind = 'set' AND s.created_at > e.created_at)
  RETURNING e.item_id, e.delta INTO v_item, v_delta;
  IF v_item IS NULL THEN RETURN NULL; END IF;
  PERFORM set_config('festival.stock_kind', 'skip', true);
  UPDATE public.festival_stock_items
  SET count = count - v_delta, updated_by = auth.uid(), updated_at = now()
  WHERE id = v_item AND count - v_delta BETWEEN 0 AND 9999
  RETURNING count INTO v_count;
  PERFORM set_config('festival.stock_kind', '', true);
  IF v_count IS NULL THEN RAISE EXCEPTION 'festival stock out of range'; END IF;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.festival_undo_stock_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.festival_undo_stock_event(uuid) TO authenticated;

-- いまある材料の数を、最初の記録として残す（記録がまだない材料だけ）。
INSERT INTO public.festival_stock_events (item_id, kind, delta, count_after, actor_id, created_at)
SELECT i.id, 'set', i.count, i.count, i.updated_by, i.updated_at
FROM public.festival_stock_items i
WHERE NOT EXISTS (SELECT 1 FROM public.festival_stock_events e WHERE e.item_id = i.id);

-- 5. 通知: 指示と買い出しの募集を、学祭の権限を持つ部員へ（出した本人を除く）
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'comment', 'notice', 'schedule_update', 'sync_failure', 'thread_reply', 'mention', 'sheet_setup',
  'festival_instruction', 'festival_trip'
]));

-- 引数: 通知の種類、出した人の列名
CREATE OR REPLACE FUNCTION public.festival_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
BEGIN
  IF public.is_mirror_write() THEN RETURN NEW; END IF;
  INSERT INTO public.notifications (user_id, actor_id, type)
  SELECT DISTINCT p.id, v_actor, TG_ARGV[0]
  FROM public.profiles p
  WHERE p.status = 'active' AND p.approved = TRUE AND p.id IS DISTINCT FROM v_actor
    AND EXISTS (SELECT 1 FROM public.roles r WHERE r.can_use_festival AND
      (r.is_everyone OR EXISTS (SELECT 1 FROM public.profile_roles pr WHERE pr.role_id = r.id AND pr.profile_id = p.id)));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.festival_notify() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS festival_instructions_notify ON public.festival_instructions;
CREATE TRIGGER festival_instructions_notify AFTER INSERT ON public.festival_instructions
  FOR EACH ROW EXECUTE FUNCTION public.festival_notify('festival_instruction', 'author_id');
DROP TRIGGER IF EXISTS festival_shopping_trips_notify ON public.festival_shopping_trips;
CREATE TRIGGER festival_shopping_trips_notify AFTER INSERT ON public.festival_shopping_trips
  FOR EACH ROW EXECUTE FUNCTION public.festival_notify('festival_trip', 'created_by');

NOTIFY pgrst, 'reload schema';
