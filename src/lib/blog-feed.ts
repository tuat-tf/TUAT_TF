import sanitizeHtml from "sanitize-html";
import { createHash } from "node:crypto";
import type { BlogRevision } from "./blog-read-state";

export const BLOG_HOME_URL = "https://nokotandf.livedoor.blog/";
export const BLOG_PAGE_SIZE = 20;
const BLOG_SOURCE_PAGE_SIZE = 3;

export type BlogFeedItem = {
  title: string;
  url: string;
  description: string;
  publishedAt: string;
  category: string | null;
  author: string | null;
};

export type BlogArticle = BlogFeedItem & { id: string; html: string };

/** Use the same source page as the first blog list; avoid downloading seven pages for a badge. */
export function blogRevision(items: BlogFeedItem[]): BlogRevision | null {
  if (!items.length) return null;
  const latest = items.slice(0, BLOG_SOURCE_PAGE_SIZE);
  return {
    hash: createHash("sha256").update(JSON.stringify(latest.map(({ url, title, publishedAt, description }) => [url, title, publishedAt, description]))).digest("hex"),
    newestAt: Math.max(0, ...latest.map((item) => Date.parse(item.publishedAt) || 0)),
  };
}

async function fetchBlogIndex(page: number): Promise<string> {
  const response = await fetch(`${BLOG_HOME_URL}?p=${page}`, {
    headers: { Accept: "text/html;charset=UTF-8" }, next: { revalidate: 15 * 60 }, signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Blog page request failed: ${response.status}`);
  return response.text();
}

export async function getLatestBlogRevision(): Promise<BlogRevision | null> {
  return blogRevision(parseBlogIndex(await fetchBlogIndex(1)));
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) {
      const codePoint = Number.parseInt(entity.slice(2), 16);
      return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    }
    if (entity.startsWith("#")) {
      const codePoint = Number.parseInt(entity.slice(1), 10);
      return codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

export function safeBlogUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "nokotandf.livedoor.blog"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
export function blogArticleId(value: string): string | null {
  const url = safeBlogUrl(value);
  return url?.match(/\/archives\/(\d+)\.html$/)?.[1] ?? null;
}

function attributeOf(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return decodeEntities(html.match(new RegExp(`\\s${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"))?.slice(1).find(Boolean) ?? "");
}

function safeMediaUrl(value: string): string | null {
  try { const url = new URL(value, BLOG_HOME_URL); return url.protocol === "https:" && ["livedoor.blogimg.jp", "resize.blogsys.jp", "i.ytimg.com"].includes(url.hostname) ? url.toString() : null; } catch { return null; }
}

export function sanitizeBlogArticleHtml(value: string): string {
  const sanitized = sanitizeHtml(value, {
    allowedTags: ["p", "br", "div", "span", "b", "strong", "i", "em", "u", "s", "del", "h2", "h3", "h4", "ul", "ol", "li", "blockquote", "img", "a"],
    allowedAttributes: { a: ["href"], img: ["src", "alt", "loading", "decoding"] },
    allowedSchemes: ["https"],
    allowProtocolRelative: false,
    nonTextTags: ["script", "style", "iframe", "object", "embed", "form", "button", "textarea", "option"],
    parseStyleAttributes: false,
    transformTags: {
      img: (_tag, attributes): sanitizeHtml.Tag => {
        const src = safeMediaUrl(attributes.src ?? "");
        return src
          ? { tagName: "img", attribs: { src, alt: attributes.alt ?? "", loading: "lazy", decoding: "async" } }
          : { tagName: "span", attribs: {} };
      },
      a: (_tag, attributes): sanitizeHtml.Tag => {
        const href = safeBlogUrl(attributes.href ?? "");
        return href ? { tagName: "a", attribs: { href } } : { tagName: "span", attribs: {} };
      },
    },
  });
  return sanitized
    .replace(/<p>(?:\s|<br>)*<\/p>/gi, "")
    .replace(/<\/p>\s*<p>/gi, "<br>")
    .replace(/(?:<br>\s*){3,}/gi, "<br><br>")
    .trim();
}

export function parseBlogArticle(html: string, expectedId: string): BlogArticle | null {
  if (!/^\d+$/.test(expectedId)) return null;
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0] ?? ""; const url = safeBlogUrl(attributeOf(canonical, "href")); if (!url || blogArticleId(url) !== expectedId) return null;
  const titleBlock = html.match(/<h1[^>]*class=["'][^"']*\barticle-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
  const body = html.match(/<div[^>]*class=["'][^"']*\barticle-body-inner\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)?.[1] ?? "";
  const dateTag = html.match(/<time[^>]*itemprop=["']datePublished["'][^>]*>/i)?.[0] ?? ""; const title = titleBlock.replace(/<[^>]+>/g, "").trim(); if (!title || !body) return null;
  return { id: expectedId, title: decodeEntities(title), url, description: "", publishedAt: attributeOf(dateTag, "datetime"), category: null, author: null, html: sanitizeBlogArticleHtml(body) };
}

function plainText(value: string): string {
  return decodeEntities(value.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

export function parseBlogIndex(html: string): BlogFeedItem[] {
  return Array.from(html.matchAll(/<article\b[\s\S]*?<\/article>/gi)).flatMap((match) => {
    const article = match[0];
    const titleBlock = article.match(/<h1[^>]*class=["'][^"']*\barticle-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
    const linkTag = titleBlock.match(/<a\b[^>]*>/i)?.[0] ?? "";
    const url = safeBlogUrl(attributeOf(linkTag, "href"));
    const title = plainText(titleBlock);
    const timeTag = article.match(/<time\b[^>]*itemprop=["']datePublished["'][^>]*>/i)?.[0] ?? "";
    const body = article.match(/<div[^>]*class=["'][^"']*\barticle-body-inner\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "";
    if (!url || !title || !blogArticleId(url)) return [];
    return [{ title, url, description: plainText(body.replace(/<span[^>]*class=["'][^"']*\barticle-continue\b[^"']*["'][^>]*>[\s\S]*$/i, "")), publishedAt: attributeOf(timeTag, "datetime"), category: null, author: null }];
  });
}

export function blogSourcePagesForAppPage(page: number): { start: number; count: number; offset: number } | null {
  if (!Number.isInteger(page) || page < 1) return null;
  const itemOffset = (page - 1) * BLOG_PAGE_SIZE;
  const start = Math.floor(itemOffset / BLOG_SOURCE_PAGE_SIZE) + 1;
  const offset = itemOffset % BLOG_SOURCE_PAGE_SIZE;
  const count = Math.ceil((offset + BLOG_PAGE_SIZE + 1) / BLOG_SOURCE_PAGE_SIZE);
  return { start, count, offset };
}

export async function getBlogPage(page: number): Promise<BlogFeedItem[]> {
  const source = blogSourcePagesForAppPage(page);
  if (!source) return [];
  const pages = await Promise.all(Array.from({ length: source.count }, (_, index) => fetchBlogIndex(source.start + index)));
  return pages
    .flatMap(parseBlogIndex)
    .slice(source.offset, source.offset + BLOG_PAGE_SIZE + 1);
}
export async function getBlogArticle(id: string): Promise<BlogArticle | null> {
  if (!/^\d+$/.test(id)) return null;
  const response = await fetch(`${BLOG_HOME_URL}archives/${id}.html`, { headers: { Accept: "text/html;charset=UTF-8" }, next: { revalidate: 15 * 60 } });
  if (!response.ok) return null;
  return parseBlogArticle(await response.text(), id);
}
