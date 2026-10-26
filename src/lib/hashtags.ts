// #ハッシュタグ。本文中の文字列そのもので、専用の表は持たない（検索は本文から探す）。
// 他のSNSと同じく、タグは文字・数字・_ が続くところまで。空白・記号・句読点・絵文字で終わる。
// 区切りは supabase/migrations/20261026030000_search_feed.sql の search_feed と揃える。

const TAG_CHARS = String.raw`[\p{L}\p{M}\p{N}_]`;
// 英数字の直後の # はタグにしない（C#、&#123; など）。URL内の # は Linkify が先に取り除く。
// 後読みにするのは、"#朝練#夕練" のように続けて書いたタグも両方拾うため。
const HASHTAG_RE = new RegExp(`(?<![0-9A-Za-z&_])[#＃](${TAG_CHARS}{1,50})`, "gu");
const TRAILING_TAG_RE = new RegExp(`(?<![0-9A-Za-z&_])[#＃](${TAG_CHARS}{0,50})$`, "u");
const LEADING_TAG_CHARS_RE = new RegExp(`^${TAG_CHARS}*`, "u");

/** 比較用（全角半角・大文字小文字を区別しない）。 */
export function hashtagKey(tag: string): string {
  return tag.normalize("NFKC").toLocaleLowerCase("ja");
}

function isTag(tag: string): boolean {
  return !/^[0-9]+$/.test(tag.normalize("NFKC"));
}

/** 本文をタグとそれ以外に分ける（表示用・入力欄の色付け用）。 */
export function splitHashtags(text: string): Array<string | { tag: string }> {
  const parts: Array<string | { tag: string }> = [];
  let last = 0;
  for (const match of text.matchAll(HASHTAG_RE)) {
    const tag = match[1];
    if (!isTag(tag)) continue;
    const start = match.index;
    if (start > last) parts.push(text.slice(last, start));
    parts.push({ tag });
    last = start + 1 + tag.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function extractHashtags(text: string): string[] {
  const seen = new Map<string, string>();
  for (const part of splitHashtags(text)) {
    if (typeof part !== "string" && !seen.has(hashtagKey(part.tag))) seen.set(hashtagKey(part.tag), part.tag);
  }
  return [...seen.values()];
}

/** 練習記録で #タグ として検索される欄（search_feed が探す欄と同じ。独自項目は対象外）。 */
export const RECORD_HASHTAG_COLUMNS = ["memo", "menu_text", "focus_text", "result_text", "strength_text"] as const;
export function isRecordHashtagField(key: string): boolean {
  return (RECORD_HASHTAG_COLUMNS as readonly string[]).includes(key);
}

export function hashtagSearchHref(tag: string): string {
  return `/timeline?q=${encodeURIComponent(`#${tag}`)}`;
}

/** カーソル位置で書きかけのタグ（"#" だけなら ""）。書いていなければ null。 */
export function hashtagQueryAt(text: string, caret: number): string | null {
  const match = text.slice(0, caret).match(TRAILING_TAG_RE);
  return match ? match[1] : null;
}

/** カーソル位置の書きかけのタグを選んだタグで置き換え、置き換え後のカーソル位置も返す。 */
export function completeHashtag(text: string, caret: number, tag: string): { text: string; caret: number } {
  const after = text.slice(caret).replace(LEADING_TAG_CHARS_RE, "");
  const before = text.slice(0, caret).replace(TRAILING_TAG_RE, () => (/^\s/.test(after) ? `#${tag}` : `#${tag} `));
  return { text: before + after, caret: before.length + (/^\s/.test(after) ? 1 : 0) };
}

export type HashtagUse = { text: string; createdAt: string; mine: boolean };
export type RankedHashtag = { tag: string; count: number; score: number };

const HALF_LIFE_DAYS = 7;

/**
 * 最近の投稿からタグ候補を並べる。新しく使われたものほど重く（7日で半分）、
 * 自分が使ったタグは少し上げる。表記は最後に使われた形を出す。
 */
export function rankHashtags(uses: HashtagUse[], now = Date.now(), limit = 50): RankedHashtag[] {
  const byKey = new Map<string, RankedHashtag & { latest: number }>();
  for (const use of uses) {
    const at = Date.parse(use.createdAt);
    if (!Number.isFinite(at)) continue;
    const ageDays = Math.max(0, now - at) / 86_400_000;
    const weight = 0.5 ** (ageDays / HALF_LIFE_DAYS) * (use.mine ? 1.5 : 1);
    for (const tag of extractHashtags(use.text)) {
      const key = hashtagKey(tag);
      const entry = byKey.get(key) ?? { tag, count: 0, score: 0, latest: -Infinity };
      entry.count += 1;
      entry.score += weight;
      if (at > entry.latest) { entry.latest = at; entry.tag = tag; }
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.score - a.score || b.latest - a.latest)
    .slice(0, limit)
    .map(({ tag, count, score }) => ({ tag, count, score }));
}

/** 書きかけの文字に合う候補。前方一致を先に、次に部分一致。入力済みと同じタグは出さない。 */
export function suggestHashtags(ranked: RankedHashtag[], query: string, limit = 6): RankedHashtag[] {
  const q = hashtagKey(query);
  if (!q) return ranked.slice(0, limit);
  const prefix = ranked.filter((item) => hashtagKey(item.tag).startsWith(q) && hashtagKey(item.tag) !== q);
  const inner = ranked.filter((item) => !hashtagKey(item.tag).startsWith(q) && hashtagKey(item.tag).includes(q));
  return [...prefix, ...inner].slice(0, limit);
}
