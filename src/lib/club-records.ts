import sanitizeHtml from "sanitize-html";
import { get } from "node:https";

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
  // This IPv4-only site intermittently stalls the WSL resolver on dual-family lookups.
  // Scope IPv4 to this request; retain TLS verification and do not alter global DNS.
  return new Promise((resolve, reject) => {
    const request = get(source.url, { family: 4, agent: false, signal: AbortSignal.timeout(8000) }, (response) => {
      void (async () => {
        try {
          if (response.statusCode !== 200) throw new Error(`Record page request failed: ${response.statusCode}`);
          const chunks: Buffer[] = []; let size = 0;
          for await (const chunk of response) {
            const bytes = Buffer.from(chunk); size += bytes.length;
            if (size > 2 * 1024 * 1024) throw new Error("Record response too large");
            chunks.push(bytes);
          }
          const bytes = Buffer.concat(chunks);
          const prefix = new TextDecoder("ascii").decode(bytes.subarray(0, 4096));
          const charset = response.headers["content-type"]?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
            ?? prefix.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] ?? "shift_jis";
          resolve(sanitizeClubRecordHtml(new TextDecoder(charset).decode(bytes)));
        } catch (error) { reject(error); }
        finally { response.destroy(); }
      })();
    });
    request.on("error", reject);
  });
}
