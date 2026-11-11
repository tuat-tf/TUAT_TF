// Server-side only. Images live in the private directory on the production PC.
import { isSafeAvatarStoragePath } from "./avatar-image";
import { isSafeTweetImagePath } from "./tweet-image";
import { assertPcAppWriteAllowed } from "./pc-backup-status";
import { LocalImageStorageError, localImageStorageEnabled, localImageInventory, signedLocalImageUrl, uploadLocalImage, removeLocalImages } from "./local-image-storage";

export type ImageBucket = "avatars" | "tweet-images" | "note-images";

export class ImageNotFoundError extends Error {
  constructor() { super("Image object not found"); this.name = "ImageNotFoundError"; }
}

export class ImageUploadError extends Error {
  constructor(public readonly status: 400 | 408 | 413 | 429, message: string) { super(message); this.name = "ImageUploadError"; }
}

/** Diagnostics contain a fixed operation name only, never exceptions or image paths. */
export function logImageFailure(operation: string) {
  console.warn("Image operation unavailable", { operation });
}

/** Bound buffered upload bytes even when Content-Length is missing or incorrect. */
export async function readImageUpload(request: Request, maxBytes: number): Promise<Buffer> {
  const oversized = () => new ImageUploadError(413, "画像の容量が大きすぎます");
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) throw oversized();
  if (!request.body) throw oversized();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  let abortRead: () => void = () => undefined;
  const interrupted = new Promise<never>((_, reject) => {
    abortRead = () => reject(new ImageUploadError(408, "画像の受信を確認できませんでした"));
  });
  const timer = setTimeout(abortRead, 30_000);
  request.signal.addEventListener("abort", abortRead, { once: true });
  if (request.signal.aborted) abortRead();
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw oversized();
      chunks.push(value);
    }
    if (!length) throw oversized();
    return Buffer.concat(chunks, length);
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof ImageUploadError) throw error;
    throw new ImageUploadError(400, "画像を読み込めませんでした");
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", abortRead);
    reader.releaseLock();
  }
}

export function imageObjectKey(bucket: ImageBucket, path: string): string {
  const valid = bucket === "avatars" ? isSafeAvatarStoragePath(path)
    : (bucket === "tweet-images" || bucket === "note-images") && isSafeTweetImagePath(path);
  if (!valid) throw new Error("Invalid image path");
  return `${bucket}/${path}`;
}

function requireLocalStorage() {
  if (!localImageStorageEnabled()) throw new Error("Local image storage is not configured");
}

/** Admin-only inventory. */
export async function getImageInventory() {
  requireLocalStorage();
  return localImageInventory();
}

/** Call only after authenticating and checking the resource's existing RLS. */
export async function signedImageUrl(bucket: ImageBucket, path: string, ttl: number) {
  const key = imageObjectKey(bucket, path);
  requireLocalStorage();
  try { return await signedLocalImageUrl(key, ttl); }
  catch (error) { if (error instanceof LocalImageStorageError && error.code === "MISSING") throw new ImageNotFoundError(); throw error; }
}

export async function uploadImage(bucket: ImageBucket, path: string, bytes: Buffer) {
  await assertPcAppWriteAllowed();
  if (process.env.IMAGE_STORAGE_READ_ONLY === "true") throw new Error("画像は読み取り専用です");
  const key = imageObjectKey(bucket, path);
  requireLocalStorage();
  return uploadLocalImage(key, bytes);
}

/** Used only for an owner-authorized removal or expired story cleanup. */
export async function removeImages(bucket: ImageBucket, paths: string[]) {
  const keys = paths.map((path) => imageObjectKey(bucket, path));
  if (!keys.length) return;
  await assertPcAppWriteAllowed();
  if (process.env.IMAGE_STORAGE_READ_ONLY === "true") throw new Error("画像は読み取り専用です");
  requireLocalStorage();
  return removeLocalImages(keys);
}
