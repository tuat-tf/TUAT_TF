import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGoogleCsv, isSafeGoogleCsvUrl } from "./google-csv-fetch";

const url = new URL("https://docs.google.com/spreadsheets/d/x/export?format=csv");
const respond = (body: string, finalUrl: string, init: ResponseInit = {}) => {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", { value: finalUrl });
  return response;
};
afterEach(() => vi.unstubAllGlobals());

describe("google csv fetch", () => {
  it("accepts only plain https Google URLs", () => {
    expect(isSafeGoogleCsvUrl(url)).toBe(true);
    expect(isSafeGoogleCsvUrl(new URL("http://docs.google.com/a"))).toBe(false);
    expect(isSafeGoogleCsvUrl(new URL("https://u:p@docs.google.com/a"))).toBe(false);
    expect(isSafeGoogleCsvUrl(new URL("https://docs.google.com:8443/a"))).toBe(false);
    expect(isSafeGoogleCsvUrl(new URL("https://evil.example/a"))).toBe(false);
    expect(isSafeGoogleCsvUrl(new URL("https://x.googleusercontent.com/a"))).toBe(true);
    expect(isSafeGoogleCsvUrl(new URL("https://googleusercontent.com.evil.example/a"))).toBe(false);
  });
  it("returns the body for a Google final URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond("a,b", "https://doc-0.googleusercontent.com/x")));
    expect(await fetchGoogleCsv(url, { timeoutMs: 1000, maxBytes: 100 })).toBe("a,b");
  });
  it("rejects a redirect to another host", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond("a", "https://evil.example/x")));
    await expect(fetchGoogleCsv(url, { timeoutMs: 1000, maxBytes: 100 })).rejects.toMatchObject({ kind: "bad_url" });
  });
  it("rejects a body over the size cap", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond("x".repeat(50), url.href)));
    await expect(fetchGoogleCsv(url, { timeoutMs: 1000, maxBytes: 10 })).rejects.toMatchObject({ kind: "too_large" });
  });
});
