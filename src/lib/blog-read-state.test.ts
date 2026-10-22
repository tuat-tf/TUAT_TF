import { afterEach, describe, expect, it, vi } from "vitest";
import { blogHasUpdates, markBlogSeen, parseBlogSeen, readBlogSeen, subscribeBlogSeen } from "./blog-read-state";

const revision = { hash: "a".repeat(64), newestAt: 1000 };
afterEach(() => vi.unstubAllGlobals());
function browser() {
  const values = new Map<string, string>();
  const target = Object.assign(new EventTarget(), { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } });
  vi.stubGlobal("window", target);
  return target;
}
describe("blog update indicators", () => {
  it("shows unread updates, clears on viewing, and detects edits with the same date", () => {
    expect(blogHasUpdates(revision, null)).toBe(true);
    expect(blogHasUpdates(revision, revision)).toBe(false);
    expect(blogHasUpdates({ ...revision, hash: "b".repeat(64) }, revision)).toBe(true);
    expect(blogHasUpdates(null, revision)).toBe(false);
    expect(blogHasUpdates({ ...revision, newestAt: 500, hash: "b".repeat(64) }, revision)).toBe(false);
  });
  it("isolates users and notifies the current tab without moving the seen time backwards", () => {
    browser(); const listener = vi.fn(); const dispose = subscribeBlogSeen("one", listener);
    markBlogSeen("one", revision);
    expect(parseBlogSeen(readBlogSeen("one"))).toEqual(revision);
    expect(readBlogSeen("two")).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    markBlogSeen("one", { hash: "b".repeat(64), newestAt: 500 });
    expect(parseBlogSeen(readBlogSeen("one"))).toEqual(revision);
    dispose(); markBlogSeen("one", { ...revision, newestAt: 2000 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("survives unavailable browser storage and malformed saved data", () => {
    vi.stubGlobal("window", { localStorage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
    expect(readBlogSeen("one")).toBeNull();
    expect(() => markBlogSeen("one", revision)).not.toThrow();
    for (const raw of [null, "{", "null", "{}", '{"hash":"x","newestAt":0}']) expect(parseBlogSeen(raw)).toBeNull();
  });
});
