import { describe, expect, it } from "vitest";
import { BLOG_PAGE_SIZE, blogSourcePagesForAppPage, parseBlogFeed, sanitizeBlogArticleHtml } from "./blog-feed";

describe("parseBlogFeed", () => {
  it("parses Livedoor RSS 1.0 items and decodes text", () => {
    const xml = `<rdf:RDF>
      <item rdf:about="https://nokotandf.livedoor.blog/archives/1.html">
        <title>練習 &amp; 自己紹介</title>
        <link>https://nokotandf.livedoor.blog/archives/1.html</link>
        <description><![CDATA[<p>本文です。</p><p>続きです。</p>]]></description>
        <dc:creator>runner</dc:creator>
        <dc:date>2026-07-21T13:54:21+09:00</dc:date>
        <dc:subject>自己紹介</dc:subject>
      </item>
    </rdf:RDF>`;

    expect(parseBlogFeed(xml)).toEqual([{
      title: "練習 & 自己紹介",
      url: "https://nokotandf.livedoor.blog/archives/1.html",
      description: "本文です。\n続きです。",
      publishedAt: "2026-07-21T13:54:21+09:00",
      category: "自己紹介",
      author: "runner",
    }]);
  });

  it("rejects links outside the configured blog", () => {
    expect(parseBlogFeed("<item><title>危険</title><link>https://example.com/</link></item>")).toEqual([]);
  });

  it("keeps a malformed numeric entity from crashing the feed", () => {
    const items = parseBlogFeed("<item><title>&#99999999; 部活動</title><link>https://nokotandf.livedoor.blog/archives/1.html</link></item>");
    expect(items[0]?.title).toBe("&#99999999; 部活動");
  });
});

describe("sanitizeBlogArticleHtml", () => {
  it("preserves readable text, supported photos and blog links", () => {
    const html = sanitizeBlogArticleHtml('<p>農工 &amp; 陸上</p><p><b>記録</b></p><img src="https://livedoor.blogimg.jp/club/photo.jpg" alt="写真 &quot;一枚&quot;"><a href="https://nokotandf.livedoor.blog/archives/1.html">記事</a>');
    expect(html).toContain("農工 &amp; 陸上<br><b>記録</b>");
    expect(html).toContain('src="https://livedoor.blogimg.jp/club/photo.jpg"');
    expect(html).toContain('alt="写真 &quot;一枚&quot;"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('<a href="https://nokotandf.livedoor.blog/archives/1.html">記事</a>');
  });

  it("rebuilds noncanonical markup with only permitted attributes", () => {
    const html = sanitizeBlogArticleHtml('<img/src="https://livedoor.blogimg.jp/club/photo.jpg" data-audit-marker="discard"><a/href="https://nokotandf.livedoor.blog/archives/1.html" data-audit-marker="discard">記事</a>');
    expect(html).toContain('src="https://livedoor.blogimg.jp/club/photo.jpg"');
    expect(html).toContain('href="https://nokotandf.livedoor.blog/archives/1.html"');
    expect(html).not.toContain("data-audit-marker");
    expect(html).not.toContain("<img/");
  });

  it("excludes foreign photos, foreign links and forbidden element contents", () => {
    const html = sanitizeBlogArticleHtml('<img src="https://example.com/photo.jpg"><a href="https://example.com/article">読める文章</a><script>audit-marker</script><form>audit-marker</form><iframe>audit-marker</iframe>');
    expect(html).toContain("読める文章");
    expect(html).not.toContain("example.com");
    expect(html).not.toContain("audit-marker");
  });
});
describe("blogSourcePagesForAppPage", () => {
  it("collects enough three-item source pages for twenty app articles plus lookahead", () => {
    expect(BLOG_PAGE_SIZE).toBe(20);
    expect(blogSourcePagesForAppPage(1)).toEqual({
      start: 1,
      count: 7,
      offset: 0,
    });
    expect(blogSourcePagesForAppPage(2)).toEqual({
      start: 7,
      count: 8,
      offset: 2,
    });
  });

  it("rejects invalid app page numbers", () => {
    expect(blogSourcePagesForAppPage(0)).toBeNull();
  });
});
