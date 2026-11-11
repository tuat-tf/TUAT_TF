import { afterEach, describe, expect, it, vi } from "vitest";
import { imageObjectKey, readImageUpload, signedImageUrl, uploadImage, removeImages } from "./image-storage";

const path = "user-1/avatar.webp";
afterEach(() => vi.unstubAllEnvs());
describe("private image storage", () => {
  it("rejects traversal and invalid namespaces before storage access", () => {
    expect(() => imageObjectKey("avatars", "../secret.webp")).toThrow("Invalid image path");
    expect(() => imageObjectKey("other" as never, path)).toThrow("Invalid image path");
    expect(imageObjectKey("avatars", path)).toBe(`avatars/${path}`);
  });
  it("refuses every operation when the local driver is not configured", async () => {
    vi.stubEnv("IMAGE_STORAGE_DRIVER", "");
    await expect(signedImageUrl("avatars", path, 300)).rejects.toThrow("not configured");
    await expect(uploadImage("avatars", path, Buffer.from("image"))).rejects.toThrow("not configured");
    await expect(removeImages("avatars", [path])).rejects.toThrow("not configured");
  });
});
describe("bounded image upload input", () => {
  it("reads a normal image body up to its byte limit", async () => {
    const request = new Request("https://app.example/upload", { method: "POST", body: "abcd" });
    expect(await readImageUpload(request, 4)).toEqual(Buffer.from("abcd"));
  });
  it("stops a chunked oversized body regardless of its declared length", async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(3)); controller.enqueue(new Uint8Array(3)); },
      cancel: cancelled,
    });
    const request = new Request("https://app.example/upload", { method: "POST", body, duplex: "half", headers: { "Content-Length": "1" } } as RequestInit);
    await expect(readImageUpload(request, 4)).rejects.toMatchObject({ status: 413 });
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("rejects a declared oversized body before reading it", async () => {
    const request = new Request("https://app.example/upload", { method: "POST", body: "abcd", headers: { "Content-Length": "5" } });
    await expect(readImageUpload(request, 4)).rejects.toMatchObject({ status: 413 });
    expect(request.bodyUsed).toBe(false);
  });
  it("bounds a stalled body and cancels its reader", async () => {
    vi.useFakeTimers();
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
    const request = new Request("https://app.example/upload", { method: "POST", body, duplex: "half" } as RequestInit);
    try {
      const assertion = expect(readImageUpload(request, 4)).rejects.toMatchObject({ status: 408 });
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
      expect(cancelled).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});
it("blocks uploads and removals while images are read-only", async () => {
  vi.stubEnv("IMAGE_STORAGE_READ_ONLY", "true");
  await expect(uploadImage("avatars", path, Buffer.from("image"))).rejects.toThrow("読み取り専用");
  await expect(removeImages("avatars", [path])).rejects.toThrow("読み取り専用");
});
