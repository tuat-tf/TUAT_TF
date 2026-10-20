import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppPublicOrigin } from "./app-public-origin";
import { ImageNotFoundError, imageObjectKey, signedImageUrl, type ImageBucket } from "./image-storage";
import { LocalImageStorageError, localImageStorageEnabled, readLocalImage } from "./local-image-storage";
import { imageThumbnail } from "./image-thumbnail";

/** Call only after the route's existing authentication, RLS and expiry/retirement checks. */
export async function authorizedImageResponse(
  request: Request,
  supabase: SupabaseClient,
  bucket: ImageBucket,
  path: string,
  signedTtl: number,
  cacheSeconds: number,
  immutable = false,
  expiresAt?: number,
): Promise<Response> {
  function remainingTtl() {
    if (expiresAt === undefined) return signedTtl;
    const remaining = Math.floor((expiresAt - Date.now()) / 1000);
    if (!Number.isFinite(remaining) || remaining <= 0) throw new ImageNotFoundError();
    headers.set("cache-control", `private, max-age=${Math.min(cacheSeconds, Math.max(0, remaining - 30))}`);
    return Math.min(signedTtl, remaining);
  }
  const headers = new Headers({
    "cache-control": `private, max-age=${cacheSeconds}${immutable ? ", immutable" : ""}`,
    vary: "Cookie",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  if (localImageStorageEnabled()) {
    try {
      // The PC already has the authorized file: return it without a second public request.
      const thumbnail = new URL(request.url).searchParams.get("variant") === "thumbnail";
      const image = await readLocalImage(imageObjectKey(bucket, path), request.method === "HEAD" && !thumbnail);
      const result = thumbnail && image.bytes ? await imageThumbnail(bucket, image.bytes) : null;
      const bytes = result?.bytes ?? image.bytes;
      const ttl = remainingTtl();
      if (result?.temporaryFallback) {
        // Retry the smaller representation soon, without another request for this display.
        headers.set("cache-control", `private, max-age=${Math.min(cacheSeconds, 30, expiresAt === undefined ? 30 : Math.max(0, ttl - 30))}`);
      }
      headers.set("content-type", result?.bytes ? "image/webp" : image.contentType);
      headers.set("content-length", String(bytes?.length ?? image.size));
      return new Response(request.method !== "HEAD" && bytes ? new Uint8Array(bytes) : null, { headers });
    } catch (error) {
      if (error instanceof LocalImageStorageError && error.code === "MISSING") throw new ImageNotFoundError();
      throw error;
    }
  }
  // Retain cloud storage's direct transfer and bounded signed URLs for its existing mode.
  const url = await signedImageUrl(supabase, bucket, path, remainingTtl());
  remainingTtl();
  headers.set("location", new URL(url, getAppPublicOrigin(request.url)).href);
  return new Response(null, { status: 307, headers });
}
