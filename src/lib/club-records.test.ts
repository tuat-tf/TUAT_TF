import { afterEach, describe, expect, it, vi } from "vitest";
import { CLUB_RECORD_SOURCES, clubRecordSource, getClubRecordHtml, sanitizeClubRecordHtml } from "./club-records";

afterEach(() => vi.unstubAllGlobals());
const fixture = '<html><head><title>Fixture only</title></head><body><p><font>種目サンプル</font></p><table><tr><th>順位</th><th>表示</th></tr><tr><td>1</td><td colspan="2">テスト用の値</td></tr></table></body></html>';
describe("club historical records", () => {
  it("exposes the observed sixteen categories and refuses arbitrary source URLs", () => {
    expect(CLUB_RECORD_SOURCES).toHaveLength(16);
    expect(new Set(CLUB_RECORD_SOURCES.map((s) => s.id)).size).toBe(16);
    expect(clubRecordSource("women-sprint")?.url).toContain("TOP10lady(Short&20Distance).html");
    expect(clubRecordSource("https://example.com/")).toBeNull();
    expect(clubRecordSource("../admin")).toBeNull();
  });
  it("preserves synthetic tables while stripping executable markup, external media, styles and links", () => {
    const html = sanitizeClubRecordHtml(fixture.replace('</body>', '<script>alert(1)</script><img src="https://example.com/tracker"><a href="javascript:alert(2)">案内</a><svg onload="alert(3)"><text>hidden</text></svg><div style="position:fixed" onclick="alert(4)">text</div></body>'));
    expect(html).toContain('<td colspan="2">テスト用の値</td>');
    expect(html).toContain('<span>種目サンプル</span>');
    expect(html).not.toMatch(/script|javascript|alert|onclick|style=|<img|<svg|hidden|href/);
  });
  it("does not silently turn missing tables or a server error into an empty record list", async () => {
    expect(() => sanitizeClubRecordHtml('<html><body>Unavailable</body></html>')).toThrow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));
    await expect(getClubRecordHtml("men-sprint")).rejects.toThrow("503");
  });
  it("fetches only the fixed source and returns sanitized content", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(fixture, { headers: { 'content-type': 'text/html; charset=UTF-8' } }));
    vi.stubGlobal("fetch", fetcher);
    expect(await getClubRecordHtml("men-sprint")).toContain("テスト用の値");
    expect(fetcher).toHaveBeenCalledWith(clubRecordSource("men-sprint")?.url, expect.objectContaining({ redirect: "error", next: { revalidate: 900 } }));
    await expect(getClubRecordHtml("invalid")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
