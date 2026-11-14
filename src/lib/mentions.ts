/**
 * @メンションの入力補完（返信・つぶやき共通）。
 * ・iPhoneの日本語キーボードの記号から打つと全角の「＠」になるので、半角と同じに扱う。
 * ・本文の末尾だけでなく、カーソルの位置で書きかけの @名前 を探す（書いた文の先頭や途中へ足せる）。
 * ・メールアドレスのように英数字の直後の @ は、メンションとみなさない。
 */
const MENTION_BEFORE_CARET = /(^|[^A-Za-z0-9_])[@＠]([^\s@＠]*)$/;

/** カーソルの位置で書きかけのメンションの、@ の後ろの文字（小文字化）。無ければ null。 */
export function mentionQueryAt(text: string, caret: number | null): string | null {
  const match = text.slice(0, caret ?? text.length).match(MENTION_BEFORE_CARET);
  return match ? match[2].toLocaleLowerCase("ja") : null;
}

/** 書きかけのメンションを「@名前 」に置き換える。置き換えた後のカーソル位置も返す。 */
export function completeMention(text: string, caret: number | null, name: string) {
  const at = caret ?? text.length;
  const before = text.slice(0, at);
  const match = before.match(MENTION_BEFORE_CARET);
  if (!match) return { text, caret: at };
  const start = before.length - match[0].length + match[1].length;
  const after = text.slice(at).replace(/^[^\s@＠]*/, "").replace(/^ /, "");
  const inserted = `@${name} `;
  return { text: text.slice(0, start) + inserted + after, caret: start + inserted.length };
}

/** 候補の絞り込み（名前か読みがなに含まれる人）。 */
export function matchesMention(member: { display_name: string; mention_reading?: string | null }, query: string) {
  return member.display_name.toLocaleLowerCase("ja").includes(query)
    || (member.mention_reading ?? "").toLocaleLowerCase("ja").includes(query);
}
