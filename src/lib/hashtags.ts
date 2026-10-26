// #ハッシュタグ。本文中の文字列そのもので、専用の表は持たない（検索は本文から探す）。
// 区切りは supabase/migrations/20261026030000_search_feed.sql の search_feed と揃える。

const STOP = "\\s#＃.,!?、。，．！？「」『』()（）<>＜＞:;：；\"'”’@＠/・…~〜～";
const TAG_BODY = `[^${STOP}]{1,30}`;
// 英数字の直後の # はタグにしない（C#、&#123; など）。URL内の # は Linkify が先に取り除く。
const HASHTAG_RE = new RegExp(`(^|[^0-9A-Za-z&_])[#＃](${TAG_BODY})`, "g");
const TRAILING_TAG_RE = new RegExp(`(^|[^0-9A-Za-z&_])[#＃]([^${STOP}]{0,30})$`);

/** 比較用（全角半角・大文字小文字を区別しない）。 */
export function hashtagKey(tag: string): string {
  return tag.normalize("NFKC").toLocaleLowerCase("ja");
}

function isTag(tag: string): boolean {
  return !/^[0-9]+$/.test(tag.normalize("NFKC"));
}

/** 本文をタグとそれ以外に分ける（表示用）。 */
export function splitHashtags(text: string): Array<string | { tag: string }> {
  const parts: Array<string | { tag: string }> = [];
  let last = 0;
  for (const match of text.matchAll(HASHTAG_RE)) {
    const tag = match[2];
    if (!isTag(tag)) continue;
    const start = match.index + match[1].length;
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

export function hashtagSearchHref(tag: string): string {
  return `/timeline/search?q=${encodeURIComponent(`#${tag}`)}`;
}

/** 入力の末尾で書きかけのタグ（"#" だけなら ""）。書いていなければ null。 */
export function trailingHashtagQuery(text: string): string | null {
  const match = text.match(TRAILING_TAG_RE);
  return match ? match[2] : null;
}

/** 書きかけのタグを選んだタグで置き換える。 */
export function completeHashtag(text: string, tag: string): string {
  return text.replace(TRAILING_TAG_RE, (_, before: string) => `${before}#${tag} `);
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
