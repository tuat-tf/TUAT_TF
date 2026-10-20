import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ select: vi.fn(), rpc: vi.fn() }));
const note = { id: "folder", author_id: "author", scope: "shared", status: "published", edit_policy: "author", author: { id: "author", display_name: "投稿者", blocks: [] }, theme: null };
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  rpc: state.rpc,
  from() {
    const query = { select: state.select, order: () => query, range: async () => ({ data: [note], error: null }) };
    state.select.mockReturnValue(query);
    return query;
  },
}) }));
import { getNotesData } from "./notes";
beforeEach(() => { state.select.mockReset(); state.rpc.mockReset(); });
it("uses aggregate counts without loading child IDs", async () => {
  state.rpc.mockResolvedValue({ data: [{ note_id: "folder", article_count: 1005, child_count: 2, thread_count: 1 }], error: null });
  const result = await getNotesData();
  expect(result.notes[0]).toMatchObject({ article_count: 1005, child_count: 2, thread_count: 1 });
  expect(result.notes[0]).not.toHaveProperty("articles");
  expect(state.select.mock.calls[0][0]).not.toMatch(/note_articles|notes!parent_id|threads!folder_id/);
});
it.each([{ data: null, error: { message: "count unavailable" } }, { data: [], error: null }])("does not turn failed or missing counts into zero", async response => {
  state.rpc.mockResolvedValue(response);
  await expect(getNotesData()).rejects.toBeDefined();
});
