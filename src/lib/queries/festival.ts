// 学祭の模擬店（試験機能）の取得。読めるのはシステム管理権限だけ（RLS）。

import { createClient } from "@/lib/supabase/server";
import { fetchAllPages } from "@/lib/fetch-all-pages";

type Person = { display_name: string } | null;

export type FestivalStockItem = { id: string; name: string; count: number; updated_at: string; updater: Person };
export type FestivalTrip = {
  id: string;
  title: string;
  note: string | null;
  status: "open" | "going" | "done";
  created_at: string;
  creator: Person;
  members: { user_id: string; profile: Person }[];
};
export type FestivalSale = { id: string; quantity: number; amount: number; sold_at: string; recorder: Person };
export type FestivalInstruction = {
  id: string;
  body: string;
  created_at: string;
  closed_at: string | null;
  author: Person;
  acks: { user_id: string; profile: Person }[];
};
export type FestivalBoardData = {
  stock: FestivalStockItem[];
  trips: FestivalTrip[];
  sales: FestivalSale[];
  instructions: FestivalInstruction[];
};

/** 学祭ページの初期データ。4種類は互いに依存しないので並列に読む。売上は新しい順に全件。 */
export async function getFestivalBoard(): Promise<FestivalBoardData> {
  const supabase = await createClient();
  const [stock, trips, sales, instructions] = await Promise.all([
    supabase
      .from("festival_stock_items")
      .select("id,name,count,updated_at,updater:profiles!updated_by(display_name)")
      .order("created_at")
      .order("id"),
    supabase
      .from("festival_shopping_trips")
      .select("id,title,note,status,created_at,creator:profiles!created_by(display_name),members:festival_shopping_members(user_id,profile:profiles!user_id(display_name))")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(50),
    fetchAllPages((from, to) => supabase
      .from("festival_sales")
      .select("id,quantity,amount,sold_at,recorder:profiles!recorded_by(display_name)")
      .order("sold_at", { ascending: false })
      .order("id")
      .range(from, to)),
    supabase
      .from("festival_instructions")
      .select("id,body,created_at,closed_at,author:profiles!author_id(display_name),acks:festival_instruction_acks(user_id,profile:profiles!user_id(display_name))")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(50),
  ]);
  if (stock.error) throw stock.error;
  if (trips.error) throw trips.error;
  if (instructions.error) throw instructions.error;
  return {
    stock: (stock.data ?? []) as unknown as FestivalStockItem[],
    trips: (trips.data ?? []) as unknown as FestivalTrip[],
    sales: sales as unknown as FestivalSale[],
    instructions: (instructions.data ?? []) as unknown as FestivalInstruction[],
  };
}
