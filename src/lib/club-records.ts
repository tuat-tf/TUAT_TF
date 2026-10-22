import sanitizeHtml from "sanitize-html";

export const CLUB_RECORDS_HOME = "https://web.tuat.ac.jp/~rikubu/record.html";
const ROOT = "https://web.tuat.ac.jp/~rikubu/record/top10/";
// Links are taken from the official index, including its original spelling.
const categories = [
  ["sprint", "短距離", "TOP10(Short%20Distance).html", "TOP10lady(Short&20Distance).html"],
  ["relay", "リレー", "TOP10(relay).html", "TOP10lady(relay).html"],
  ["hurdles", "ハードル", "TOP10(hurdle).html", "TOP10lady(hurdle).html"],
  ["distance", "中長距離", "TOP10(Middle&LongDistance).html", "TOP10lady(Middle%20&Long%20Distance).html"],
  ["road", "ロード", "TOP10(road).html", "TOP10lady(road).html"],
  ["jumps", "跳躍", "TOP10(Jumping).html", "TOP10lady(Jumping).html"],
  ["throws", "投てき", "TOP10(Throwing).html", "TOP10lady(Throwing).html"],
  ["combined", "混成", "TOP10(decathlon).html", "TOP10lady(heptathlon).html"],
] as const;

export const CLUB_RECORD_SOURCES = (["men", "women"] as const).flatMap((gender) => categories.map(([id, label, men, women]) => ({
  id: `${gender}-${id}`, gender, category: label, label: `${gender === "men" ? "男子" : "女子"}・${label}`,
  url: ROOT + (gender === "men" ? `TOP10/${men}` : `TOP10lady/${women}`),
})));

export function clubRecordSource(id: string) {
  return CLUB_RECORD_SOURCES.find((source) => source.id === id) ?? null;
}

export function sanitizeClubRecordHtml(source: string): string {
  const body = source.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1];
  if (!body || !/<table\b/i.test(body) || !/<tr\b/i.test(body)) throw new Error("Record page structure unavailable");
  return sanitizeHtml(body, {
    allowedTags: ["p", "br", "div", "span", "b", "strong", "i", "em", "u", "h1", "h2", "h3", "h4", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "hr"],
    allowedAttributes: { td: ["colspan", "rowspan"], th: ["colspan", "rowspan", "scope"] },
    allowedSchemes: [],
    nonTextTags: ["script", "style", "iframe", "object", "embed", "form", "button", "textarea", "select", "svg", "math"],
    parseStyleAttributes: false,
    transformTags: { font: "span", nobr: "span", center: "div" },
  });
}

export async function getClubRecordHtml(id: string): Promise<string> {
  const source = clubRecordSource(id);
  if (!source) throw new Error("Unknown record category");
  const response = await fetch(source.url, { redirect: "error", next: { revalidate: 15 * 60 }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Record page request failed: ${response.status}`);
  if (!response.body) throw new Error("Record response unavailable");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error("Record response too large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const prefix = new TextDecoder("ascii").decode(bytes.slice(0, 4096));
  const charset = response.headers.get("content-type")?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
    ?? prefix.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? "shift_jis";
  return sanitizeClubRecordHtml(new TextDecoder(charset).decode(bytes));
}
