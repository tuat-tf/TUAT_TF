import type { SupabaseClient } from "@supabase/supabase-js";
import { getAppPublicOrigin } from "./app-public-origin";
import { ImageNotFoundError, imageObjectKey, signedImageUrl, type ImageBucket } from "./image-storage";
import { LocalImageStorageError, localImageStorageEnabled, readLocalImage } from "./local-image-storage";

/** Call only after the route's existing authentication, RLS and expiry/retirement checks. */
export async function authorizedImageResponse(
  request: Request,
  supabase: SupabaseClient,
  bucket: ImageBucket,
  path: string,
  signedTtl: number,
  cacheSeconds: number,
  immutable = false,
): Promise<Response> {
  const headers = new Headers({
    "cache-control": `private, max-age=${cacheSeconds}${immutable ? ", immutable" : ""}`,
    vary: "Cookie",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  if (localImageStorageEnabled()) {
    try {
      // The PC already has the authorized file: return it without a second public request.
      const image = await readLocalImage(imageObjectKey(bucket, path), request.method === "HEAD");
      headers.set("content-type", image.contentType);
      headers.set("content-length", String(image.size));
      return new Response(image.bytes ? new Uint8Array(image.bytes) : null, { headers });
    } catch (error) {
      if (error instanceof LocalImageStorageError && error.code === "MISSING") throw new ImageNotFoundError();
      throw error;
    }
  }
  // Retain cloud storage's direct transfer and bounded signed URLs for its existing mode.
  const url = await signedImageUrl(supabase, bucket, path, signedTtl);
  headers.set("location", new URL(url, getAppPublicOrigin(request.url)).href);
  return new Response(null, { status: 307, headers });
}
