-- 学祭の模擬店（サーターアンダギー）の試験機能。
--   材料の数・買い出しの募集・売上・店長からの指示を置く。
--   本採用するかは未定なので、読み書きはシステム管理権限（can_manage_system）だけにしている。
--   部員へ広げるときは、このポリシーを新しい migration で差し替える。
-- 再実行しても同じ状態になる（冪等）。

-- 1. 材料（部室にある数）
CREATE TABLE IF NOT EXISTS public.festival_stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  count integer NOT NULL DEFAULT 0 CHECK (count BETWEEN 0 AND 9999),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. 買い出し（募集と、行く人）
CREATE TABLE IF NOT EXISTS public.festival_shopping_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 80),
  note text CHECK (note IS NULL OR length(note) <= 300),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'going', 'done')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.festival_shopping_members (
  trip_id uuid NOT NULL REFERENCES public.festival_shopping_trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, user_id)
);

-- 3. 売上（1会計1行。金額は入力時の価格表の値を残す）
CREATE TABLE IF NOT EXISTS public.festival_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  amount integer NOT NULL CHECK (amount > 0),
  sold_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS festival_sales_sold_at_idx ON public.festival_sales (sold_at DESC, id);

-- 4. 店長からの指示と、確認した人
CREATE TABLE IF NOT EXISTS public.festival_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 500),
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.festival_instruction_acks (
  instruction_id uuid NOT NULL REFERENCES public.festival_instructions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  acked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (instruction_id, user_id)
);

ALTER TABLE public.festival_stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_shopping_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_shopping_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.festival_instruction_acks ENABLE ROW LEVEL SECURITY;

-- 材料・買い出し・指示: システム管理権限があれば読み書きできる。
DROP POLICY IF EXISTS festival_stock_items_all ON public.festival_stock_items;
CREATE POLICY festival_stock_items_all ON public.festival_stock_items FOR ALL TO authenticated
  USING (public.can_manage_system()) WITH CHECK (public.can_manage_system());
DROP POLICY IF EXISTS festival_shopping_trips_all ON public.festival_shopping_trips;
CREATE POLICY festival_shopping_trips_all ON public.festival_shopping_trips FOR ALL TO authenticated
  USING (public.can_manage_system()) WITH CHECK (public.can_manage_system());
DROP POLICY IF EXISTS festival_instructions_all ON public.festival_instructions;
CREATE POLICY festival_instructions_all ON public.festival_instructions FOR ALL TO authenticated
  USING (public.can_manage_system()) WITH CHECK (public.can_manage_system());

-- 行く人・確認した人: 読むのは権限があれば全員分、足す・外すのは自分の行だけ。
DROP POLICY IF EXISTS festival_shopping_members_read ON public.festival_shopping_members;
CREATE POLICY festival_shopping_members_read ON public.festival_shopping_members FOR SELECT TO authenticated
  USING (public.can_manage_system());
DROP POLICY IF EXISTS festival_shopping_members_insert ON public.festival_shopping_members;
CREATE POLICY festival_shopping_members_insert ON public.festival_shopping_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_system() AND user_id = auth.uid());
DROP POLICY IF EXISTS festival_shopping_members_delete ON public.festival_shopping_members;
CREATE POLICY festival_shopping_members_delete ON public.festival_shopping_members FOR DELETE TO authenticated
  USING (public.can_manage_system() AND user_id = auth.uid());

DROP POLICY IF EXISTS festival_instruction_acks_read ON public.festival_instruction_acks;
CREATE POLICY festival_instruction_acks_read ON public.festival_instruction_acks FOR SELECT TO authenticated
  USING (public.can_manage_system());
DROP POLICY IF EXISTS festival_instruction_acks_insert ON public.festival_instruction_acks;
CREATE POLICY festival_instruction_acks_insert ON public.festival_instruction_acks FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_system() AND user_id = auth.uid());
DROP POLICY IF EXISTS festival_instruction_acks_delete ON public.festival_instruction_acks;
CREATE POLICY festival_instruction_acks_delete ON public.festival_instruction_acks FOR DELETE TO authenticated
  USING (public.can_manage_system() AND user_id = auth.uid());

-- 売上: 入れた人として自分を残す。直すときは取り消して入れ直す（UPDATE は許可しない）。
DROP POLICY IF EXISTS festival_sales_read ON public.festival_sales;
CREATE POLICY festival_sales_read ON public.festival_sales FOR SELECT TO authenticated
  USING (public.can_manage_system());
DROP POLICY IF EXISTS festival_sales_insert ON public.festival_sales;
CREATE POLICY festival_sales_insert ON public.festival_sales FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_system() AND recorded_by = auth.uid());
DROP POLICY IF EXISTS festival_sales_delete ON public.festival_sales;
CREATE POLICY festival_sales_delete ON public.festival_sales FOR DELETE TO authenticated
  USING (public.can_manage_system());

REVOKE ALL ON public.festival_stock_items, public.festival_shopping_trips, public.festival_shopping_members,
  public.festival_sales, public.festival_instructions, public.festival_instruction_acks FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.festival_stock_items, public.festival_shopping_trips,
  public.festival_instructions TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.festival_shopping_members, public.festival_sales,
  public.festival_instruction_acks TO authenticated;

-- 材料の数を増減する。2人が同時に押しても数がずれないよう、DB側で足し引きする。
-- 権限がない・0を下回る・上限を超えるときは何も変えず NULL を返す（RLSが効くよう INVOKER）。
CREATE OR REPLACE FUNCTION public.festival_adjust_stock(p_item_id uuid, p_delta integer)
RETURNS integer LANGUAGE sql SECURITY INVOKER SET search_path = public AS $$
  UPDATE public.festival_stock_items
  SET count = count + p_delta, updated_by = auth.uid(), updated_at = now()
  WHERE id = p_item_id AND count + p_delta BETWEEN 0 AND 9999
  RETURNING count;
$$;
REVOKE ALL ON FUNCTION public.festival_adjust_stock(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.festival_adjust_stock(uuid, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
