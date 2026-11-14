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
 * 本文に「@名前」（全角の＠も）と書いてある部員。候補から選ばずに名前を打ち切った場合もメンションにする。
 * 名前の直後が文字の続き（例: @林 と @林田）なら別の人なので数えない。
 */
export function mentionedMembers<T extends { display_name: string }>(text: string, members: T[]): T[] {
  return members.filter(member => {
    const name = member.display_name;
    if (!name) return false;
    for (const at of ["@", "＠"]) {
      let from = 0;
      for (;;) {
        const index = text.indexOf(at + name, from);
        if (index < 0) break;
        const before = text[index - 1];
        const after = text[index + at.length + name.length];
        if ((before === undefined || !/[A-Za-z0-9_]/.test(before)) && (after === undefined || /[\s、。,.!！?？@＠]/.test(after))) return true;
        from = index + 1;
      }
    }
    return false;
  });
}
