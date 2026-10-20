// Server-side only. Shared input guard for the avatar, story and note image uploads.
// Uploads are always raster photos, so other decoders (e.g. SVG via librsvg, which has had
// memory-safety advisories) are never reached from member input. sharp.block() is not used:
// it is process-wide and next/og rasterizes the app's own icon SVG with sharp.
import sharp, { type Sharp } from "sharp";

export const UPLOAD_IMAGE_MAX_PIXELS = 50_000_000;

export type UploadImageFormat = "jpeg" | "png" | "webp";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

/** Identify the upload from its leading bytes. Content-Type is only the client's claim. */
export function detectUploadImageFormat(bytes: Uint8Array): UploadImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return "png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  return null;
}

/**
 * Decoder for an upload whose contents are one of the allowed raster formats.
 * Returns null without decoding anything when the bytes are another format.
 */
export function uploadImageDecoder(
  input: Buffer, allowed: readonly UploadImageFormat[], limitInputPixels = UPLOAD_IMAGE_MAX_PIXELS,
): Sharp | null {
  const format = detectUploadImageFormat(input);
  if (!format || !allowed.includes(format)) return null;
  return sharp(input, { limitInputPixels });
}
