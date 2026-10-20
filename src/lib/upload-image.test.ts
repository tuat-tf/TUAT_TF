import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { detectUploadImageFormat, uploadImageDecoder } from "./upload-image";

const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');

function raster(format: "jpeg" | "png" | "webp") {
  return sharp({ create: { width: 4, height: 4, channels: 3, background: "#336699" } }).toFormat(format).toBuffer();
}

describe("upload image guard", () => {
  it("identifies JPEG, PNG and WebP from their contents", async () => {
    for (const format of ["jpeg", "png", "webp"] as const) {
      expect(detectUploadImageFormat(await raster(format))).toBe(format);
    }
  });

  it("rejects SVG, GIF and truncated input without decoding", () => {
    const gif = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");
    for (const bytes of [SVG, Buffer.from(`\n  ${SVG}`), gif, Buffer.from([0xff, 0xd8]), Buffer.alloc(0)]) {
      expect(detectUploadImageFormat(bytes)).toBeNull();
      expect(uploadImageDecoder(bytes, ["jpeg", "png", "webp"])).toBeNull();
    }
  });

  it("accepts only the formats each upload allows", async () => {
    expect(uploadImageDecoder(await raster("png"), ["jpeg", "webp"])).toBeNull();
    const output = await uploadImageDecoder(await raster("webp"), ["jpeg", "webp"])!.webp().toBuffer();
    expect(detectUploadImageFormat(output)).toBe("webp");
  });

  it("preserves the caller's input pixel limit", async () => {
    const input = await raster("jpeg");
    await expect(uploadImageDecoder(input, ["jpeg"], 15)!.toBuffer()).rejects.toThrow(/pixel limit/i);
    await expect(uploadImageDecoder(input, ["jpeg"], 16)!.toBuffer()).resolves.toBeInstanceOf(Buffer);
  });
});
