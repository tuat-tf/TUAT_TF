import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { get } from "node:https";
import { fetchBlogIndex, getBlogArticle, getBlogPage } from "./blog-feed";

vi.mock("node:https", () => ({ get: vi.fn() }));

function respond(statusCode: number, body: string) {
  vi.mocked(get).mockImplementation((_url, _options, callback) => {
    const request = new EventEmitter();
    queueMicrotask(() => {
      const response = Object.assign(Readable.from([Buffer.from(body)]), { statusCode });
      (callback as (response: unknown) => void)(response);
    });
    return request as ReturnType<typeof get>;
  });
}

beforeEach(() => vi.resetAllMocks());

describe("official blog requests", () => {
  it("uses bounded IPv4 HTTPS for the index and article without weakening TLS", async () => {
    respond(200, '<link rel="canonical" href="https://nokotandf.livedoor.blog/archives/1.html"><h1 class="article-title">合成記事</h1><time itemprop="datePublished" datetime="2026-10-22T00:00:00Z"></time><div class="article-body-inner">本文</div></div>');
    await fetchBlogIndex(1);
    expect((await getBlogArticle("1"))?.html).toBe("本文");
    for (const call of vi.mocked(get).mock.calls) {
      expect(call[1]).toMatchObject({ family: 4, agent: false, signal: expect.any(AbortSignal) });
      expect(call[1]).not.toHaveProperty("rejectUnauthorized", false);
    }
  });

  it("does not turn a provider outage, timeout, or changed article layout into not-found", async () => {
    respond(503, "unavailable");
    await expect(getBlogArticle("1")).rejects.toThrow("503");
    respond(200, "unrecognized page");
    await expect(getBlogArticle("1")).rejects.toThrow("structure unavailable");
    vi.mocked(get).mockImplementation(() => {
      const request = new EventEmitter();
      queueMicrotask(() => request.emit("error", new Error("timeout")));
      return request as ReturnType<typeof get>;
    });
    await expect(fetchBlogIndex(1)).rejects.toThrow("timeout");
  });

  it("reserves not-found for article 404 and rejects oversized responses", async () => {
    respond(404, "");
    expect(await getBlogArticle("1")).toBeNull();
    await expect(fetchBlogIndex(1)).rejects.toThrow("index unavailable");
    respond(200, "x".repeat(2 * 1024 * 1024 + 1));
    await expect(fetchBlogIndex(1)).rejects.toThrow("too large");
  });

  it("keeps a failed source page visible as an error instead of dropping articles", async () => {
    const load = vi.fn(async (page: number) => {
      if (page === 4) throw new Error("source unavailable");
      return "";
    });
    await expect(getBlogPage(1, load)).rejects.toThrow("source unavailable");
  });
});
