import type { createClient } from "@/lib/supabase/client";

type BrowserClient = ReturnType<typeof createClient>;

/** Change only the order; stale list rows must never replace another editor's fields. */
export async function saveCompetitionOrder(
  client: BrowserClient,
  table: "competitions" | "competition_events",
  keys: string[],
): Promise<boolean> {
  if (new Set(keys).size !== keys.length || keys.some((key) => !key)) return false;
  const results = await Promise.all(keys.map(async (key, index) => {
    try {
      const patch = { sort_order: (index + 1) * 10 };
      const { data, error } = table === "competitions"
        ? await client.from("competitions").update(patch).eq("id", key).select("id").single()
        : await client.from("competition_events").update(patch).eq("name", key).select("name").single();
      return !error && !!data;
    } catch {
      return false;
    }
  }));
  // Some rows may have been saved. The caller refreshes the list on failure;
  // replaying stale rows as a rollback could destroy a concurrent edit.
  return results.every(Boolean);
}
