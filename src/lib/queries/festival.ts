// 学祭の模擬店の取得。読めるのは学祭の権限を持つ部員だけ（RLS）。
// 売上の行は「日をまたいだ学祭の売上」の権限ならすべて、ほかの人は直近1時間の分だけ読める（RLSでも同じ制限）。
// 日ごとに売れた個数（金額なし）は全員が読める（festival_daily_pieces）。

import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/fetch-all-pages";

type Person = { display_name: string } | null;

/** count は残りの数、initial_count は用意した数 */
export type FestivalStockItem = { id: string; name: string; count: number; initial_count: number; updated_at: string; updater: Person };
/** 材料の残りの変更。use は「使った」（取り消せる）、set は足した・数え直した。 */
export type FestivalStockEvent = { id: string; item_id: string; kind: "use" | "set"; delta: number; count_after: number; created_at: string; actor: Person };
export type FestivalSale = { id: string; quantity: number; amount: number; sold_at: string; recorder: Person };
/** day は日本時間の YYYY-MM-DD */
export type FestivalDailyPieces = { day: string; pieces: number };
export type FestivalBoardData = {
  stock: FestivalStockItem[];
  /** 新しい順。材料ごとに直近の分を画面で絞る */
  stockEvents: FestivalStockEvent[];
  sales: FestivalSale[];
  /** 日ごとに売れた個数。新しい順。金額は含まない */
  dailyPieces: FestivalDailyPieces[];
};

/** 売上を直近1時間だけ見せる人の範囲 */
export const FESTIVAL_RECENT_SALES_MS = 60 * 60 * 1000;

/**
 * 学祭ページの初期データ。互いに依存しないので並列に読む。
 * 売上は新しい順。日をまたいだ売上の権限なら全件、ほかの人は直近1時間。
 */
export async function getFestivalBoard({ manager }: { manager: boolean }): Promise<FestivalBoardData> {
  const supabase = await createClient();
  const salesSince = manager ? null : new Date(Date.now() - FESTIVAL_RECENT_SALES_MS).toISOString();
  const [stock, stockEvents, sales, dailyPieces] = await Promise.all([
    supabase
      .from("festival_stock_items")
      .select("id,name,count,initial_count,updated_at,updater:profiles!updated_by(display_name)")
      .order("created_at")
      .order("id"),
    supabase
      .from("festival_stock_events")
      .select("id,item_id,kind,delta,count_after,created_at,actor:profiles!actor_id(display_name)")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(300),
    fetchAllPages((from, to) => {
      const query = supabase
        .from("festival_sales")
        .select("id,quantity,amount,sold_at,recorder:profiles!recorded_by(display_name)");
      return (salesSince ? query.gte("sold_at", salesSince) : query)
        .order("sold_at", { ascending: false })
        .order("id")
        .range(from, to);
    }),
    getFestivalDailyPieces(supabase),
  ]);
  if (stock.error) throw stock.error;
  if (stockEvents.error) throw stockEvents.error;
  return {
    stock: (stock.data ?? []) as unknown as FestivalStockItem[],
    stockEvents: (stockEvents.data ?? []) as unknown as FestivalStockEvent[],
    sales: sales as unknown as FestivalSale[],
    dailyPieces,
  };
}

type Client = Awaited<ReturnType<typeof createClient>>;

async function getFestivalDailyPieces(supabase: Client): Promise<FestivalDailyPieces[]> {
  const { data, error } = await supabase.rpc("festival_daily_pieces");
  if (error) throw error;
  return (data ?? []).map((row) => ({ day: row.day, pieces: Number(row.pieces) }));
}

export type FestivalHomeData = { stock: Pick<FestivalStockItem, "id" | "name" | "count" | "initial_count">[]; dailyPieces: FestivalDailyPieces[] };

/** ホームの学祭カード用。材料の残りと、日ごとに売れた個数。 */
export async function getFestivalHome(): Promise<FestivalHomeData> {
  const supabase = await createClient();
  const [stock, dailyPieces] = await Promise.all([
    supabase.from("festival_stock_items").select("id,name,count,initial_count").order("created_at").order("id"),
    getFestivalDailyPieces(supabase),
  ]);
  if (stock.error) throw stock.error;
  return { stock: stock.data ?? [], dailyPieces };
}
