import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createImageThumbnailCache, encodeImageThumbnail, THUMBNAIL_LIMITS } from "./image-thumbnail";

const MiB = 1024 * 1024;
const source = (name: string) => Buffer.from(`original:${name}`);
const unchanged = { bytes: null, temporaryFallback: false };
const temporary = { bytes: null, temporaryFallback: true };

afterEach(() => vi.useRealTimers());

function controlledEncoder() {
  const jobs: {
    input: Buffer; size: number;
    resolve: (result: Buffer | null) => void;
    reject: (error: Error) => void;
  }[] = [];
  let active = 0;
  let peak = 0;
  const encode = vi.fn((input: Buffer, size: number) => {
    active++;
    peak = Math.max(peak, active);
    return new Promise<Buffer | null>((resolve, reject) => {
      jobs.push({ input, size, resolve, reject });
    }).finally(() => { active--; });
  });
  return { jobs, encode, peak: () => peak };
}

describe("real thumbnail encoding", () => {
  it.each([
    { format: "jpeg", width: 1600, height: 800, size: 1024, expected: [1024, 512] },
    { format: "png", width: 800, height: 1600, size: 1024, expected: [512, 1024] },
    { format: "webp", width: 512, height: 256, size: 192, expected: [192, 96] },
  ] as const)("resizes $format to $expected without cropping", async ({ format, width, height, size, expected }) => {
    const input = await sharp({ create: { width, height, channels: 3, background: "#4286ab" } })
      .toFormat(format).toBuffer();
    const original = Buffer.from(input);
    const result = await encodeImageThumbnail(input, size);
    expect(result).not.toBeNull();
    const metadata = await sharp(result!).metadata();
    expect([metadata.width, metadata.height]).toEqual(expected);
    expect(metadata.format).toBe("webp");
    expect(result!.length).toBeLessThan(input.length);
    expect(input).toEqual(original);
  });

  it("applies EXIF orientation before presenting the smaller photograph", async () => {
    const input = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "#4286ab" } })
      .withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const result = await encodeImageThumbnail(input, 1024);
    expect(result).not.toBeNull();
    const metadata = await sharp(result!).metadata();
    expect([metadata.width, metadata.height]).toEqual([512, 1024]);
    expect(metadata.orientation).toBeUndefined();
  });

  it("preserves transparency in a resized PNG", async () => {
    const input = await sharp({ create: {
      width: 512, height: 256, channels: 4, background: { r: 20, g: 100, b: 180, alpha: 0.5 },
    } }).png().toBuffer();
    const result = await encodeImageThumbnail(input, 192);
    expect(result).not.toBeNull();
    expect((await sharp(result!).metadata()).hasAlpha).toBe(true);
    const { data, info } = await sharp(result!).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    expect(data[3]).toBeGreaterThanOrEqual(127);
    expect(data[3]).toBeLessThanOrEqual(128);
  });

  it.each(["jpeg", "png", "webp"] as const)("keeps an already small %s byte-for-byte instead of re-encoding or enlarging", async format => {
    const input = await sharp({ create: { width: 192, height: 96, channels: 3, background: "red" } })
      .toFormat(format).toBuffer();
    const original = Buffer.from(input);
    expect(await createImageThumbnailCache()("avatars", input)).toEqual(unchanged);
    expect(input).toEqual(original);
  });

  it("keeps an animated legacy WebP instead of flattening it", async () => {
    const frames = Buffer.alloc(256 * 512 * 3, 200);
    frames.fill(30, 0, 256 * 256 * 3);
    const input = await sharp(frames, { raw: { width: 256, height: 512, channels: 3, pageHeight: 256 } })
      .webp({ delay: [80, 120], loop: 0 }).toBuffer();
    expect((await sharp(input).metadata()).pages).toBe(2);
    expect(await encodeImageThumbnail(input, 192)).toBeNull();
  });

  it("retains an efficient original when a resized derivative would use more bytes", async () => {
    const input = await sharp({ create: { width: 512, height: 512, channels: 3, background: "red" } })
      .webp({ lossless: true }).toBuffer();
    const derivative = await sharp(input).resize(192, 192).webp({ quality: 82, effort: 2 }).toBuffer();
    expect(derivative.length).toBeGreaterThan(input.length);
    await expect(encodeImageThumbnail(input, 192)).resolves.toBeNull();
  });

  it.each([
    Buffer.from('<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512"/></svg>'),
    Buffer.from("GIF89a\x01\x00\x01\x00", "latin1"),
    Buffer.from("%PDF-1.7\n"),
    Buffer.alloc(0),
  ])("does not send non-raster or unsupported bytes to the thumbnail encoder (%#)", async input => {
    await expect(encodeImageThumbnail(input, 192)).resolves.toBeNull();
  });

  it("falls back to the original when a raster header is present but decoding fails", async () => {
    const input = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    await expect(createImageThumbnailCache()("avatars", input)).resolves.toEqual(temporary);
  });
});

describe("thumbnail identity and cache lifetime", () => {
  it("deduplicates pending requests by byte hash and reuses the completed result", async () => {
    const { encode, jobs } = controlledEncoder();
    const thumbnail = createImageThumbnailCache(encode);
    const input = source("same");
    const first = thumbnail("avatars", input);
    expect(thumbnail("avatars", Buffer.from(input))).toBe(first);
    expect(encode).toHaveBeenCalledTimes(1);
    jobs[0].resolve(Buffer.from("smaller"));
    const result = await first;
    expect(result).toEqual({ bytes: Buffer.from("smaller"), temporaryFallback: false });
    expect(await thumbnail("avatars", Buffer.from(input))).toBe(result);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it("separates buckets and changed bytes, and chooses the fixed bucket sizes", async () => {
    const encode = vi.fn<(input: Buffer, size: number) => Promise<Buffer | null>>(async () => Buffer.from("smaller"));
    const thumbnail = createImageThumbnailCache(encode);
    const input = source("same");
    await thumbnail("avatars", input);
    await thumbnail("tweet-images", input);
    await thumbnail("note-images", input);
    await thumbnail("avatars", source("changed"));
    expect(encode.mock.calls.map(call => call[1])).toEqual([192, 1024, 1024, 192]);
  });

  it("expires successful derivatives after ten minutes without extending TTL on a hit", async () => {
    let time = 10_000;
    const encode = vi.fn(async () => Buffer.from("smaller"));
    const thumbnail = createImageThumbnailCache(encode, () => time);
    const input = source("ttl");
    await thumbnail("avatars", input);
    time += THUMBNAIL_LIMITS.cacheMs - 1;
    await thumbnail("avatars", input);
    expect(encode).toHaveBeenCalledTimes(1);
    time++;
    await thumbnail("avatars", input);
    expect(encode).toHaveBeenCalledTimes(2);
  });

  it("also caches the decision to retain a small original, within the same finite TTL", async () => {
    let time = 0;
    const encode = vi.fn(async () => null);
    const thumbnail = createImageThumbnailCache(encode, () => time);
    await expect(thumbnail("avatars", source("small"))).resolves.toEqual(unchanged);
    await thumbnail("avatars", source("small"));
    expect(encode).toHaveBeenCalledTimes(1);
    time = THUMBNAIL_LIMITS.cacheMs;
    await thumbnail("avatars", source("small"));
    expect(encode).toHaveBeenCalledTimes(2);
  });

  it("bounds the cache at 256 entries and evicts the least recently used entry", async () => {
    const encode = vi.fn(async () => Buffer.from("smaller"));
    const thumbnail = createImageThumbnailCache(encode);
    for (let i = 0; i < 256; i++) await thumbnail("avatars", source(String(i)));
    expect(encode).toHaveBeenCalledTimes(256);
    await thumbnail("avatars", source("0"));
    await thumbnail("avatars", source("256"));
    await thumbnail("avatars", source("0"));
    expect(encode).toHaveBeenCalledTimes(257);
    await thumbnail("avatars", source("1"));
    expect(encode).toHaveBeenCalledTimes(258);
  });

  it("bounds output bytes at 32 MiB even when the entry count is low", async () => {
    const output = Buffer.alloc(8 * MiB);
    const encode = vi.fn(async () => output);
    const thumbnail = createImageThumbnailCache(encode);
    for (const name of ["a", "b", "c", "d"]) await thumbnail("avatars", source(name));
    await thumbnail("avatars", source("a"));
    expect(encode).toHaveBeenCalledTimes(4);
    await thumbnail("avatars", source("e"));
    await thumbnail("avatars", source("a"));
    expect(encode).toHaveBeenCalledTimes(5);
    await thumbnail("avatars", source("b"));
    expect(encode).toHaveBeenCalledTimes(6);
  });

  it("does not cache a derivative larger than the entire output budget", async () => {
    const encode = vi.fn(async () => Buffer.alloc(THUMBNAIL_LIMITS.cacheBytes + 1));
    const thumbnail = createImageThumbnailCache(encode);
    await thumbnail("avatars", source("oversize"));
    await thumbnail("avatars", source("oversize"));
    expect(encode).toHaveBeenCalledTimes(2);
  });
});

describe("bounded thumbnail work and recovery", () => {
  it("runs two encoders with 32 waiters, deduplicates at capacity, and can retry a rejected new request", async () => {
    const { encode, jobs, peak } = controlledEncoder();
    const thumbnail = createImageThumbnailCache(encode);
    const requests = Array.from({ length: 34 }, (_, index) => thumbnail("avatars", source(String(index))));
    expect(encode).toHaveBeenCalledTimes(2);
    expect(thumbnail("avatars", source("0"))).toBe(requests[0]);
    expect(thumbnail("avatars", source("33"))).toBe(requests[33]);
    await expect(thumbnail("avatars", source("overflow"))).resolves.toEqual(temporary);
    expect(encode).toHaveBeenCalledTimes(2);
    jobs[0].resolve(Buffer.from("done"));
    await requests[0];
    expect(encode).toHaveBeenCalledTimes(3);
    requests.push(thumbnail("avatars", source("overflow")));
    for (let index = 1; index < requests.length; index++) {
      jobs[index].resolve(Buffer.from("done"));
      await expect(requests[index]).resolves.toEqual({ bytes: Buffer.from("done"), temporaryFallback: false });
    }
    expect(encode).toHaveBeenCalledTimes(35);
    expect(peak()).toBe(2);
  });

  it("counts running and queued inputs toward the 16 MiB reservation and releases completed inputs", async () => {
    const { encode, jobs } = controlledEncoder();
    const thumbnail = createImageThumbnailCache(encode);
    const first = thumbnail("avatars", Buffer.alloc(4 * MiB, 1));
    const second = thumbnail("avatars", Buffer.alloc(4 * MiB, 2));
    const queued = thumbnail("avatars", Buffer.alloc(8 * MiB, 3));
    expect(encode).toHaveBeenCalledTimes(2);
    await expect(thumbnail("avatars", Buffer.from("over-budget"))).resolves.toEqual(temporary);
    jobs[0].resolve(null);
    await first;
    expect(encode).toHaveBeenCalledTimes(3);
    const replacement = thumbnail("avatars", Buffer.alloc(4 * MiB, 4));
    jobs[1].resolve(null);
    await second;
    expect(encode).toHaveBeenCalledTimes(4);
    jobs[2].resolve(null);
    jobs[3].resolve(null);
    await expect(queued).resolves.toEqual(unchanged);
    await expect(replacement).resolves.toEqual(unchanged);
  });

  it("rejects a single input above 16 MiB without consuming a worker or poisoning a later request", async () => {
    const encode = vi.fn(async () => null);
    const thumbnail = createImageThumbnailCache(encode);
    await expect(thumbnail("avatars", Buffer.alloc(THUMBNAIL_LIMITS.inputBytes + 1))).resolves.toEqual(temporary);
    expect(encode).not.toHaveBeenCalled();
    await expect(thumbnail("avatars", source("normal"))).resolves.toEqual(unchanged);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it("releases a failed encoder's slot and bytes before starting the next queued job", async () => {
    const { encode, jobs, peak } = controlledEncoder();
    const thumbnail = createImageThumbnailCache(encode);
    const first = thumbnail("avatars", Buffer.alloc(4 * MiB, 1));
    const second = thumbnail("avatars", Buffer.alloc(4 * MiB, 2));
    const queued = thumbnail("avatars", Buffer.alloc(8 * MiB, 3));
    jobs[0].reject(new Error("synthetic encoder failure"));
    await expect(first).resolves.toEqual(temporary);
    expect(encode).toHaveBeenCalledTimes(3);
    const replacement = thumbnail("avatars", Buffer.alloc(4 * MiB, 4));
    jobs[1].resolve(null);
    await second;
    expect(encode).toHaveBeenCalledTimes(4);
    jobs[2].resolve(null);
    jobs[3].resolve(null);
    await expect(queued).resolves.toEqual(unchanged);
    await expect(replacement).resolves.toEqual(unchanged);
    expect(peak()).toBe(2);
  });

  it("handles a synchronous encoder exception and retries that image after the short fallback TTL", async () => {
    let time = 0;
    const encode = vi.fn<(_: Buffer, size: number) => Promise<Buffer | null>>()
      .mockImplementationOnce(() => { throw new Error("synthetic native failure"); })
      .mockResolvedValue(Buffer.from("smaller"));
    const thumbnail = createImageThumbnailCache(encode, () => time);
    const input = Buffer.alloc(16 * MiB, 1);
    await expect(thumbnail("avatars", input)).resolves.toEqual(temporary);
    // A different full-budget input can run immediately, proving the failed reservation was released.
    await expect(thumbnail("avatars", Buffer.alloc(16 * MiB, 2))).resolves.toEqual({
      bytes: Buffer.from("smaller"), temporaryFallback: false,
    });
    time = 29_999;
    await expect(thumbnail("avatars", input)).resolves.toEqual(temporary);
    expect(encode).toHaveBeenCalledTimes(2);
    time = 30_000;
    await expect(thumbnail("avatars", input)).resolves.toEqual({
      bytes: Buffer.from("smaller"), temporaryFallback: false,
    });
    expect(encode).toHaveBeenCalledTimes(3);
  });
});

describe("thumbnail response deadlines", () => {
  it("returns fallback after two seconds while retaining native workers, pending dedupe and the waiting limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { encode, jobs, peak } = controlledEncoder();
    const thumbnail = createImageThumbnailCache(encode);
    const requests = Array.from({ length: 34 }, (_, index) => thumbnail("avatars", source(String(index))));
    let replies = 0;
    requests.forEach(request => { void request.then(() => { replies++; }); });
    await vi.advanceTimersByTimeAsync(THUMBNAIL_LIMITS.responseMs - 1);
    expect(replies).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(replies).toBe(34);
    expect(await Promise.all(requests)).toEqual(Array.from({ length: 34 }, () => temporary));
    expect(thumbnail("avatars", source("0"))).toBe(requests[0]);
    expect(thumbnail("avatars", source("33"))).toBe(requests[33]);
    await expect(thumbnail("avatars", source("overflow"))).resolves.toEqual(temporary);
    expect(encode).toHaveBeenCalledTimes(2);

    jobs[0].resolve(Buffer.from("completed-late"));
    await vi.advanceTimersByTimeAsync(0);
    // Every expired queued job must be discarded without starting native image work.
    expect(encode).toHaveBeenCalledTimes(2);
    const next = thumbnail("avatars", source("after-settle"));
    expect(encode).toHaveBeenCalledTimes(3);
    await expect(thumbnail("avatars", source("0"))).resolves.toEqual({
      bytes: Buffer.from("completed-late"), temporaryFallback: false,
    });
    jobs[1].resolve(null);
    jobs[2].resolve(null);
    await expect(next).resolves.toEqual(unchanged);
    await vi.advanceTimersByTimeAsync(0);
    expect(peak()).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains all input reservations after fallback until native work really settles", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { encode, jobs } = controlledEncoder();
    const thumbnail = createImageThumbnailCache(encode);
    const firstInput = Buffer.alloc(8 * MiB, 1);
    const first = thumbnail("avatars", firstInput);
    const second = thumbnail("avatars", Buffer.alloc(8 * MiB, 2));
    await vi.advanceTimersByTimeAsync(THUMBNAIL_LIMITS.responseMs);
    await expect(first).resolves.toEqual(temporary);
    await expect(second).resolves.toEqual(temporary);
    expect(thumbnail("avatars", Buffer.from(firstInput))).toBe(first);
    await expect(thumbnail("avatars", source("next"))).resolves.toEqual(temporary);
    expect(encode).toHaveBeenCalledTimes(2);

    jobs[0].reject(new Error("native work finally stopped"));
    await vi.advanceTimersByTimeAsync(0);
    const next = thumbnail("avatars", Buffer.alloc(8 * MiB, 3));
    expect(encode).toHaveBeenCalledTimes(3);
    jobs[1].resolve(null);
    jobs[2].resolve(null);
    await expect(next).resolves.toEqual(unchanged);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start an expired queued job when the timer callback itself was delayed", async () => {
    vi.useFakeTimers();
    let time = 0;
    const { encode, jobs } = controlledEncoder();
    const thumbnail = createImageThumbnailCache(encode, () => time);
    const first = thumbnail("avatars", source("first"));
    const second = thumbnail("avatars", source("second"));
    const queued = thumbnail("avatars", source("queued"));
    // Simulate a busy event loop: wall-clock deadline passed but timers have not run yet.
    time = THUMBNAIL_LIMITS.responseMs + 1;
    jobs[0].resolve(null);
    await vi.advanceTimersByTimeAsync(0);
    await expect(first).resolves.toEqual(unchanged);
    expect(encode).toHaveBeenCalledTimes(2);
    await expect(queued).resolves.toEqual(temporary);
    jobs[1].resolve(null);
    await second;
    expect(vi.getTimerCount()).toBe(0);
  });
});
