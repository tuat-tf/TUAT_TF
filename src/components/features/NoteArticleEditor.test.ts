import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AuthorMini, NoteArticleWithAuthor, NotePollOption } from "@/types";

type Draft = { dirty: boolean; busy: boolean; intent?: string; onSave: () => void | Promise<void> };
type ButtonProps = { children: ReactNode; disabled?: boolean; onClick?: () => void };
const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), read: vi.fn(), refresh: vi.fn(), done: vi.fn(),
  draft: null as Draft | null,
}));

vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState<State>(initial: State | (() => State)) {
    const slot = hooks.cursor++;
    if (!(slot in hooks.values)) hooks.values[slot] = typeof initial === "function" ? (initial as () => State)() : initial;
    return [hooks.values[slot], (value: State | ((before: State) => State)) => {
      hooks.values[slot] = typeof value === "function" ? (value as (before: State) => State)(hooks.values[slot] as State) : value;
    }];
  },
  useRef<Value>(initial: Value) {
    const slot = hooks.cursor++;
    if (!(slot in hooks.values)) hooks.values[slot] = { current: initial };
    return hooks.values[slot];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: mocks.rpc,
    from: () => {
      const query = { select: () => query, eq: () => query, single: mocks.read };
      return query;
    },
  }),
}));
vi.mock("@/components/ui/form-modal", () => ({
  FormModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", {}, children),
  useFormDraft: (draft: Draft) => { mocks.draft = draft; },
}));
vi.mock("@/components/features/NoteBodyEditor", () => ({ NoteBodyEditor: () => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: (props: ButtonProps) => createElement("button", { disabled: props.disabled, onClick: props.onClick }, props.children),
}));

import { NoteArticleEditor } from "./NoteArticleEditor";

const author: AuthorMini = { id: "author", display_name: "記録者", avatar_url: null, blocks: [], grade: null };
const article: NoteArticleWithAuthor = {
  id: "article", note_id: "note", author_id: author.id, author,
  title: "連絡事項", body: "集合場所を確認してください", pinned: false,
  created_at: "2026-10-20T01:00:00Z", updated_at: "2026-10-20T01:00:00Z",
  poll_multiple: false, poll_anonymous: true, poll_allow_options: false,
};

function render(value = article) {
  hooks.cursor = 0;
  return renderToStaticMarkup(createElement(NoteArticleEditor, {
    noteId: value.note_id, currentUser: author, article: value, onDone: mocks.done,
  }));
}

beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
  mocks.draft = null;
  mocks.rpc.mockReset();
  mocks.read.mockReset();
  mocks.refresh.mockReset();
  mocks.done.mockReset();
});

describe("note article save protection", () => {
  it("requires a result check before closing even when an unchanged article has an unknown save", async () => {
    mocks.rpc.mockRejectedValue(new Error("response lost"));
    mocks.read.mockResolvedValue({ data: null, error: { message: "offline" } });
    render();
    expect(mocks.draft).toMatchObject({ dirty: false, busy: false });
    await mocks.draft!.onSave();
    const html = render();
    expect(mocks.draft).toMatchObject({ dirty: true, busy: false, intent: "check" });
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(html).toContain("保存結果を確認");
    await mocks.draft!.onSave();
    render();
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.done).not.toHaveBeenCalled();

    mocks.read.mockResolvedValue({
      data: { ...article, updated_at: "2026-10-20T01:01:00Z", note_poll_options: [] },
      error: null,
    });
    await mocks.draft!.onSave();
    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.done).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps voted options disabled and sends the complete poll through the atomic RPC", async () => {
    const options: NotePollOption[] = ["参加", "欠席"].map((text, index) => ({
      id: `option-${index}`, article_id: article.id, text, created_by: author.id,
      sort_order: index, vote_count: index === 0 ? 2 : 0, voted_by_me: false, voters: [],
    }));
    mocks.rpc.mockResolvedValue({ data: { updated_at: "2026-10-20T01:01:00Z" }, error: null });
    const html = render({ ...article, pollOptions: options });
    expect(html).toMatch(/aria-label="参加を外す"[^>]*disabled=""/);
    expect(html).not.toMatch(/aria-label="欠席を外す"[^>]*disabled=""/);
    await mocks.draft!.onSave();
    expect(mocks.rpc).toHaveBeenCalledWith("save_note_article", expect.objectContaining({
      p_id: article.id,
      p_expected_updated_at: article.updated_at,
      p_existing_option_ids: ["option-0", "option-1"],
      p_kept_option_ids: ["option-0", "option-1"],
      p_new_options: [],
      p_poll_enabled: true,
    }));
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.done).toHaveBeenCalledOnce();
  });
});
