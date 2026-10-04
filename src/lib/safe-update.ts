import type { Database } from "@/types/database";
import type { createClient } from "@/lib/supabase/client";

type BrowserClient = ReturnType<typeof createClient>;
type PublicTables = Database["public"]["Tables"];
type PublicTableName = keyof PublicTables;
type PublicUpdate = PublicTables[PublicTableName]["Update"];

export type SafeUpdateResult =
  | { ok: true }
  | { ok: false; reason: "error" | "blocked" };

/**
 * RLSや期限切れセッションで更新が0件になった場合に、一度だけ再認証して再試行する。
 * 更新後にidを返し、実際に対象行が更新されたことまで確認する。
 */
export async function safeUpdate(
  supabase: BrowserClient,
  table: PublicTableName,
  values: PublicUpdate,
  match: Record<string, string | number | boolean | null>,
): Promise<SafeUpdateResult> {
  const run = () => supabase.from(table).update(values).match(match).select("id");

  let { data, error } = await run();
  if (!error && (!data || data.length === 0)) {
    await supabase.auth.refreshSession();
    ({ data, error } = await run());
  }

  if (error || !data || data.length === 0) {
    return { ok: false, reason: error ? "error" : "blocked" };
  }
  return { ok: true };
}

/** One-row deletion: a denied/absent row is not success, and an uncertain delete is never replayed. */
export async function safeDelete(
  supabase: BrowserClient,
  table: PublicTableName,
  match: Record<string, string | number | boolean | null>,
): Promise<SafeUpdateResult> {
  try {
    const primaryKey = table === "competition_events" ? "name" : "id";
    if (typeof match[primaryKey] !== "string" || !match[primaryKey]) return { ok: false, reason: "blocked" };
    const { data, error } = await supabase.from(table).delete().match(match).select(primaryKey);
    if (error) return { ok: false, reason: "error" };
    return data?.length === 1 ? { ok: true } : { ok: false, reason: "blocked" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** 更新失敗時に利用者へ表示する共通メッセージ。 */
export function safeUpdateMessage(reason: "error" | "blocked"): string {
  return reason === "error"
    ? "保存できませんでした。もう一度お試しください"
    : "保存できませんでした。画面を開き直してから、もう一度お試しください";
}
