// Process-local derivatives only: originals remain the sole stored/backup objects.
import { createHash } from "node:crypto";
import type { ImageBucket } from "./image-storage";
import { uploadImageDecoder } from "./upload-image";

export const THUMBNAIL_LIMITS = {
  avatarSize: 192, photoSize: 1024,
  cacheBytes: 32 * 1024 * 1024, cacheEntries: 256, cacheMs: 10 * 60_000,
  concurrent: 2, waiting: 32, inputBytes: 16 * 1024 * 1024, responseMs: 2000,
} as const;

type Result = { bytes: Buffer | null; temporaryFallback: boolean };
type Encoder = (input: Buffer, size: number) => Promise<Buffer | null>;
const original: Result = { bytes: null, temporaryFallback: false };
const fallback: Result = { bytes: null, temporaryFallback: true };

export async function encodeImageThumbnail(input: Buffer, size: number): Promise<Buffer | null> {
  const decoder = uploadImageDecoder(input, ["jpeg", "png", "webp"]);
  if (!decoder) return null;
  decoder.timeout({ seconds: 3 });
  const metadata = await decoder.metadata();
  // Do not flatten an animated legacy image, upscale, or re-encode an already small image.
  if ((metadata.pages ?? 1) > 1 || !metadata.width || !metadata.height ||
      Math.max(metadata.width, metadata.height) <= size) return null;
  const bytes = await decoder.rotate().resize(size, size, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 2 }).toBuffer();
  return bytes.length < input.length ? bytes : null;
}

/** Call after permission checks AND a successful original-file read, even for cache hits. */
export function createImageThumbnailCache(
  encode: Encoder = encodeImageThumbnail,
  now: () => number = Date.now,
) {
  const cache = new Map<string, { result: Result; expires: number }>();
  const pending = new Map<string, Promise<Result>>();
  const queue: Array<() => void> = [];
  let cacheBytes = 0;
  let inputBytes = 0;
  let active = 0;

  function evict(key: string) {
    cacheBytes -= cache.get(key)?.result.bytes?.length ?? 0;
    cache.delete(key);
  }
  function remember(key: string, result: Result) {
    const size = result.bytes?.length ?? 0;
    if (size > THUMBNAIL_LIMITS.cacheBytes) return;
    while (cache.size >= THUMBNAIL_LIMITS.cacheEntries || cacheBytes + size > THUMBNAIL_LIMITS.cacheBytes) {
      evict(cache.keys().next().value!);
    }
    cache.set(key, { result, expires: now() + (result.temporaryFallback ? 30_000 : THUMBNAIL_LIMITS.cacheMs) });
    cacheBytes += size;
  }

  return function thumbnail(bucket: ImageBucket, input: Buffer): Promise<Result> {
    // Hash the bytes just read, not the path/mtime: deletion or replacement must not use stale bytes.
    const key = `${bucket}:${createHash("sha256").update(input).digest("hex")}`;
    for (const [storedKey, entry] of cache) if (entry.expires <= now()) evict(storedKey);
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return Promise.resolve(hit.result);
    }
    const running = pending.get(key);
    if (running) return running;
    if (inputBytes + input.length > THUMBNAIL_LIMITS.inputBytes ||
        (active >= THUMBNAIL_LIMITS.concurrent && queue.length >= THUMBNAIL_LIMITS.waiting)) {
      return Promise.resolve(fallback);
    }
    inputBytes += input.length;
    let resolve!: (result: Result) => void;
    const promise = new Promise<Result>(done => { resolve = done; });
    pending.set(key, promise);
    const deadline = now() + THUMBNAIL_LIMITS.responseMs;
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      resolve(fallback);
    }, THUMBNAIL_LIMITS.responseMs);
    const start = () => {
      active++;
      void (async () => {
        let result = fallback;
        try {
          if (!expired && now() < deadline) {
            const bytes = await encode(input, bucket === "avatars" ? THUMBNAIL_LIMITS.avatarSize : THUMBNAIL_LIMITS.photoSize);
            result = bytes ? { bytes, temporaryFallback: false } : original;
          }
        } catch {
          // A failed derivative must not break an otherwise valid original image.
        } finally {
          clearTimeout(timer);
          remember(key, result);
          pending.delete(key);
          inputBytes -= input.length;
          active--;
          resolve(result);
          // Keep the native encoder's reservation until it actually settles.
          queue.shift()?.();
        }
      })();
    };
    if (active < THUMBNAIL_LIMITS.concurrent) start();
    else queue.push(start);
    return promise;
  };
}

export const imageThumbnail = createImageThumbnailCache();
