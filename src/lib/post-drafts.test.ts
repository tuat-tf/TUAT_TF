import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPostDraft, postDraftKey, readPostDraft, writePostDraft } from "./post-drafts";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  });
});

describe("post drafts on this device", () => {
  it("keeps a draft per member and kind, and reads it back", () => {
    writePostDraft("tweet", "member-a", { content: "書きかけ" }, 1000);
    writePostDraft("record", "member-a", { memo: "記録" }, 1000);
    expect(readPostDraft("tweet", "member-a", 2000)).toEqual({ savedAt: 1000, values: { content: "書きかけ" } });
    expect(readPostDraft("record", "member-a", 2000)?.values).toEqual({ memo: "記録" });
    // Another member on the same device does not see it.
    expect(readPostDraft("tweet", "member-b", 2000)).toBeNull();
    expect(readPostDraft("story", "member-a", 2000)).toBeNull();
  });

  it("clears a draft and drops ones older than two weeks", () => {
    writePostDraft("tweet", "member-a", { content: "古い" }, 0);
    expect(readPostDraft("tweet", "member-a", 15 * 86_400_000)).toBeNull();
    expect(store.has(postDraftKey("tweet", "member-a"))).toBe(false);
    writePostDraft("tweet", "member-a", { content: "新しい" }, 0);
    clearPostDraft("tweet", "member-a");
    expect(readPostDraft("tweet", "member-a", 1)).toBeNull();
  });

  it("does nothing without a member or when storage is unusable", () => {
    writePostDraft("tweet", null, { content: "x" });
    expect(store.size).toBe(0);
    store.set(postDraftKey("tweet", "member-a"), "{broken");
    expect(readPostDraft("tweet", "member-a")).toBeNull();
    vi.stubGlobal("window", { localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } } });
    expect(() => writePostDraft("tweet", "member-a", { content: "x" })).not.toThrow();
    expect(readPostDraft("tweet", "member-a")).toBeNull();
    expect(() => clearPostDraft("tweet", "member-a")).not.toThrow();
  });
});
