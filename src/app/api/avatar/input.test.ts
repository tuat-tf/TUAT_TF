import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const upload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => {
  let updating = false;
  const query = {
    select: () => query, eq: () => query, is: () => query,
    update: () => { updating = true; return query; },
    maybeSingle: async () => ({ data: updating ? { id: "synthetic-member" } : { avatar_url: null }, error: null }),
  };
  return {
    auth: { getUser: async () => ({ data: { user: { id: "synthetic-member" } }, error: null }) },
    rpc: async () => ({ data: true, error: null }),
    from: () => query,
  };
} }));
vi.mock("@/lib/image-storage", async original => ({ ...await original<typeof import("@/lib/image-storage")>(), uploadImage: upload }));
import { POST } from "./route";

beforeEach(() => upload.mockReset().mockResolvedValue(undefined));
function request(body: Buffer | string, contentType = "image/webp") {
  return new Request("https://app.example/api/avatar", { method: "POST", headers: { "Content-Type": contentType }, body: body as BodyInit });
}
describe("avatar image conversion limits", () => {
  it("saves a normal photo as a 512px WebP", async () => {
    const original = await sharp({ create: { width: 16, height: 12, channels: 3, background: "red" } }).webp().toBuffer();
    expect((await POST(request(original))).status).toBe(200);
    expect(upload).toHaveBeenCalledOnce();
    const metadata = await sharp(upload.mock.calls[0][3]).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 512, height: 512 });
  });
  it("rejects a small input that expands beyond the pixel limit before uploading", async () => {
    const input = await sharp({ create: { width: 10000, height: 5001, channels: 3, background: "red" } })
      .jpeg({ quality: 1 }).toBuffer();
    expect(input.length).toBeLessThan(2 * 1024 * 1024);
    expect((await POST(request(input, "image/jpeg"))).status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });
  it("rejects an unreadable image without uploading or changing its reference", async () => {
    // Pass the JPEG format guard, then fail the real decoder on incomplete data.
    const truncatedJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect((await POST(request(truncatedJpeg, "image/jpeg"))).status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
  });
});
