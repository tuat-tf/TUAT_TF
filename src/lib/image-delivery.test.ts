import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const state = vi.hoisted(() => ({
  user: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  row: vi.fn(), rpc: vi.fn(), read: vi.fn(), sign: vi.fn(), local: true,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const query = { select: () => query, eq: () => query, or: () => query, maybeSingle: state.row };
    return { auth: { getUser: async () => ({ data: { user: state.user } }) }, from: () => query, rpc: state.rpc };
  },
}));
vi.mock("@/lib/local-image-storage", async original => ({
  ...await original<typeof import("@/lib/local-image-storage")>(),
  localImageStorageEnabled: () => state.local,
  readLocalImage: state.read,
}));
vi.mock("@/lib/image-storage", async original => ({
  ...await original<typeof import("@/lib/image-storage")>(), signedImageUrl: state.sign,
}));
import { GET as avatar } from "@/app/api/avatar/image/route";
import { GET as tweet } from "@/app/api/tweet-image/route";
import { GET as note } from "@/app/api/note-image/route";
import { LocalImageStorageError } from "./local-image-storage";

const uid = "11111111-1111-4111-8111-111111111111";
const path = `${uid}/22222222-2222-4222-8222-222222222222.webp`;
const cases = [
  { name: "avatar", handler: avatar, url: `/api/avatar/image?path=${uid}/avatar.webp`, key: `avatars/${uid}/avatar.webp`, cache: "private, max-age=518400, immutable" },
  { name: "tweet", handler: tweet, url: `/api/tweet-image?path=${path}`, key: `tweet-images/${path}`, cache: "private, max-age=240" },
  { name: "note", handler: note, url: "/api/note-image?id=synthetic", key: `note-images/${path}`, cache: "private, max-age=240" },
];
beforeEach(() => {
  state.user = { id: uid };
  state.local = true;
  state.row.mockReset().mockResolvedValue({ data: { id: uid, approved: true, path, expires_at: null }, error: null });
  state.rpc.mockReset().mockImplementation(async name => ({ data: name !== "avatar_image_is_retired", error: null }));
  state.read.mockReset().mockResolvedValue({ bytes: Buffer.from("webp-fixture"), contentType: "image/webp", size: 12 });
  state.sign.mockReset().mockResolvedValue("/api/local-image?signature=synthetic");
});
afterEach(() => vi.useRealTimers());

describe.each(cases)("$name local image delivery", ({ handler, url, key, cache }) => {
  it("serves a smaller thumbnail and matching HEAD while keeping the original URL intact", async () => {
    const width = key.startsWith("avatars/") ? 512 : 1600;
    const source = await sharp({ create: { width, height: width, channels: 3, background: "#4286ab" } }).webp().toBuffer();
    state.read.mockResolvedValue({ bytes: source, contentType: "image/webp", size: source.length });
    const thumbnailUrl = `https://app.example.test${url}&variant=thumbnail`;
    const response = await handler(new Request(thumbnailUrl));
    const bytes = Buffer.from(await response.arrayBuffer());
    expect((await sharp(bytes).metadata()).width).toBe(key.startsWith("avatars/") ? 192 : 1024);
    expect(bytes.length).toBeLessThan(source.length);
    expect(response.headers.get("location")).toBeNull();
    const head = await handler(new Request(thumbnailUrl, { method: "HEAD" }));
    expect(head.headers.get("content-length")).toBe(String(bytes.length));
    expect(await head.text()).toBe("");
    expect(state.read).toHaveBeenLastCalledWith(key, false);
    const original = await handler(new Request(`https://app.example.test${url}`));
    expect(Buffer.from(await original.arrayBuffer())).toEqual(source);
    state.read.mockClear();
    state.user = null;
    expect((await handler(new Request(thumbnailUrl))).status).toBe(401);
    expect(state.read).not.toHaveBeenCalled();
    state.user = { id: uid };
    state.row.mockResolvedValueOnce({ data: null, error: { code: "unavailable" } });
    expect((await handler(new Request(thumbnailUrl))).status).toBe(503);
    expect(state.read).not.toHaveBeenCalled();
    if (key.startsWith("avatars/")) state.rpc.mockImplementation(async () => ({ data: true, error: null }));
    else state.row.mockResolvedValueOnce({ data: null, error: null });
    expect((await handler(new Request(thumbnailUrl))).status).toBe(404);
    expect(state.read).not.toHaveBeenCalled();
    state.rpc.mockImplementation(async name => ({ data: name !== "avatar_image_is_retired", error: null }));
    state.read.mockRejectedValue(new LocalImageStorageError("MISSING"));
    expect((await handler(new Request(thumbnailUrl))).status).toBe(404);
    state.read.mockRejectedValue(new LocalImageStorageError("UNAVAILABLE"));
    expect((await handler(new Request(thumbnailUrl))).status).toBe(503);
  });
  it("keeps cloud mode's authorized redirect without reading local bytes", async () => {
    state.local = false;
    const response = await handler(new Request(`https://app.example.test${url}&variant=thumbnail`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toMatch(/\/api\/local-image\?signature=synthetic$/);
    expect(state.sign).toHaveBeenCalledOnce();
    expect(state.read).not.toHaveBeenCalled();
  });
  it("falls back to the original in the same response if encoding fails, with a short private cache", async () => {
    const bytes = Buffer.from("RIFFxxxxWEBPbroken");
    state.read.mockResolvedValue({ bytes, contentType: "image/webp", size: bytes.length });
    const response = await handler(new Request(`https://app.example.test${url}&variant=thumbnail`));
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("cache-control")).toBe("private, max-age=30");
    expect(response.headers.get("location")).toBeNull();
    expect(state.read).toHaveBeenCalledOnce();
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("serves the authorized image in the first response without a signed-URL round trip", async () => {
    const response = await handler(new Request(`https://app.example.test${url}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe(cache);
    expect(response.headers.get("vary")).toBe("Cookie");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("webp-fixture");
    expect(state.read).toHaveBeenCalledExactlyOnceWith(key, false);
    expect(state.sign).not.toHaveBeenCalled();
  });
  it("does not read an image before successful authentication", async () => {
    state.user = null;
    expect((await handler(new Request(`https://app.example.test${url}`))).status).toBe(401);
    expect(state.read).not.toHaveBeenCalled();
  });
  it("does not hide an authorization lookup failure as an image absence", async () => {
    state.row.mockResolvedValue({ data: null, error: { code: "unavailable" } });
    expect((await handler(new Request(`https://app.example.test${url}`))).status).toBe(503);
    expect(state.read).not.toHaveBeenCalled();
  });
  it("distinguishes a missing object from unavailable storage without caching failures", async () => {
    for (const [code, status] of [["MISSING", 404], ["UNAVAILABLE", 503]] as const) {
      state.read.mockRejectedValue(new LocalImageStorageError(code));
      const response = await handler(new Request(`https://app.example.test${url}`));
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });
  it("supports HEAD without reading image bytes", async () => {
    state.read.mockResolvedValue({ contentType: "image/webp", size: 12 });
    const response = await handler(new Request(`https://app.example.test${url}`, { method: "HEAD" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-length")).toBe("12");
    expect(await response.text()).toBe("");
    expect(state.read).toHaveBeenCalledExactlyOnceWith(key, true);
  });
});

it("keeps an expiring story's private cache shorter than its remaining lifetime", async () => {
  state.row.mockResolvedValue({ data: { id: uid, expires_at: new Date(Date.now() + 65_000).toISOString() }, error: null });
  const response = await tweet(new Request(`https://app.example.test/api/tweet-image?path=${path}`));
  expect(response.status).toBe(200);
  const seconds = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1]);
  expect(seconds).toBeGreaterThanOrEqual(0);
  expect(seconds).toBeLessThanOrEqual(35);
});
it("does not serve a story that expires while the original is being read", async () => {
  vi.useFakeTimers();
  const start = Date.now();
  state.row.mockResolvedValue({ data: { id: uid, expires_at: new Date(start + 2_000).toISOString() }, error: null });
  state.read.mockImplementation(async () => {
    vi.setSystemTime(start + 2_001);
    return { bytes: Buffer.from("small"), size: 5, contentType: "image/webp" };
  });
  const response = await tweet(new Request(`https://app.example.test${cases[1].url}&variant=thumbnail`));
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("shortens cache lifetime after processing, including a temporary thumbnail fallback", async () => {
  vi.useFakeTimers();
  const start = Date.now();
  state.row.mockResolvedValue({ data: { id: uid, expires_at: new Date(start + 65_000).toISOString() }, error: null });
  state.read.mockImplementation(async () => {
    vi.setSystemTime(start + 40_000);
    const bytes = Buffer.from("RIFFxxxxWEBPanother-broken");
    return { bytes, size: bytes.length, contentType: "image/webp" };
  });
  const response = await tweet(new Request(`https://app.example.test${cases[1].url}&variant=thumbnail`));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, max-age=0");
});
it("continues to deny a retired avatar and an expired or RLS-hidden story before reading storage", async () => {
  state.rpc.mockResolvedValue({ data: true, error: null });
  expect((await avatar(new Request(`https://app.example.test${cases[0].url}`))).status).toBe(404);
  state.row.mockResolvedValue({ data: null, error: null });
  expect((await tweet(new Request(`https://app.example.test${cases[1].url}`))).status).toBe(404);
  expect((await note(new Request(`https://app.example.test${cases[2].url}`))).status).toBe(404);
  expect(state.read).not.toHaveBeenCalled();
});
