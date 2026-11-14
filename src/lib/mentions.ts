/**
 * @メンションの入力補完（返信・つぶやき共通）。
 * ・iPhoneの日本語キーボードの記号から打つと全角の「＠」になるので、半角と同じに扱う。
 * ・本文の末尾だけでなく、カーソルの位置で書きかけの @名前 を探す（書いた文の先頭や途中へ足せる）。
 * ・メールアドレスのように英数字の直後の @ は、メンションとみなさない。
 */
const MENTION_BEFORE_CARET = /(^|[^A-Za-z0-9_])[@＠]([^\s@＠]*)$/;

/**
 * 書きかけのメンションを探す位置。まずカーソルの位置、無ければ本文の末尾。
 * iPhoneの日本語入力は変換中のカーソル位置を変換前の位置で返すことがあり、カーソルだけを
 * 見ると打っている途中の @名前 を見落とす。
 */
export function mentionCaret(text: string, caret: number | null): number | null {
  if (caret !== null && MENTION_BEFORE_CARET.test(text.slice(0, caret))) return caret;
  return MENTION_BEFORE_CARET.test(text) ? text.length : null;
}

/** 書きかけのメンションの、@ の後ろの文字（小文字化）。無ければ null。 */
export function mentionQueryAt(text: string, caret: number | null): string | null {
  const at = mentionCaret(text, caret);
  const match = at === null ? null : text.slice(0, at).match(MENTION_BEFORE_CARET);
  return match ? match[2].toLocaleLowerCase("ja") : null;
}

/** 書きかけのメンションを「@名前 」に置き換える。置き換えた後のカーソル位置も返す。 */
export function completeMention(text: string, caret: number | null, name: string) {
  const at = mentionCaret(text, caret) ?? caret ?? text.length;
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

/**
 * 本文中の「@名前」（全角の＠も）の位置。保存するメンション先の判定と、表示のリンクの両方がこれを使う。
 * ・長い名前を先に当てる（@林田 を @林 と読まない）。
 * ・メールアドレスのように英数字の直後の @ は数えない。
 */
export function mentionSpans(text: string, names: string[]): Array<{ start: number; end: number; name: string }> {
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  const spans: Array<{ start: number; end: number; name: string }> = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== "@" && text[index] !== "＠") continue;
    if (index > 0 && /[A-Za-z0-9_]/.test(text[index - 1])) continue;
    const name = sorted.find(candidate => text.startsWith(candidate, index + 1));
    if (!name) continue;
    spans.push({ start: index, end: index + 1 + name.length, name });
    index += name.length;
  }
  return spans;
}

/**
 * 保存するメンション先。
 * ・候補から選んだ人（pickedIds）は、名前の後ろに文字が続いても（@田中さん）メンションにする。
 * ・選ばずに名前を打ち切った場合は、名前の直後が空白・句読点・文末のときだけ。
 * ・同じ名前の部員が複数いて誰も選んでいないときは、誰にも通知しない（別の人へ届くのを防ぐ）。
 * 編集のときは、すでに付いているメンション（書いた時点の名前）も members に混ぜて渡す。
 */
export function resolveMentions<T extends { id: string; display_name: string }>(text: string, members: T[], pickedIds: string[]): T[] {
  const found = new Map<string, T>();
  for (const span of mentionSpans(text, members.map(member => member.display_name))) {
    const same = members.filter(member => member.display_name === span.name);
    const picked = same.filter(member => pickedIds.includes(member.id));
    const after = text[span.end];
    const complete = after === undefined || /[\s、。,.!！?？@＠]/.test(after);
    const targets = picked.length ? picked : complete && new Set(same.map(member => member.id)).size === 1 ? same : [];
    for (const member of targets) if (!found.has(member.id)) found.set(member.id, member);
  }
  return [...found.values()];
}
