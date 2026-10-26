// 書きかけの練習記録・つぶやきを、この端末に下書きとして残す（2026-10-27 所有者指示）。
// 投稿・送信待ちではない。サーバーへは何も送らず、投稿するまでは本人の端末の中だけにある。
// 保存先は localStorage で、使えない端末（プライベートブラウズ等）では黙って何もしない。

export type PostDraftKind = "tweet" | "story" | "record";
export type PostDraft<T> = { savedAt: number; values: T };

const PREFIX = "track-app:post-draft:v1";
/** 古い下書きはいつまでも残さない。 */
const MAX_AGE_MS = 14 * 86_400_000;

/** 同じ端末を別の部員が使っても混ざらないよう、本人のIDごとに分ける。 */
export function postDraftKey(kind: PostDraftKind, userId: string): string {
  return `${PREFIX}:${kind}:${userId}`;
}

export function readPostDraft<T>(kind: PostDraftKind, userId: string | null | undefined, now = Date.now()): PostDraft<T> | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(postDraftKey(kind, userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as PostDraft<T>;
    if (!draft || typeof draft.savedAt !== "number" || !draft.values || now - draft.savedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(postDraftKey(kind, userId));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writePostDraft<T>(kind: PostDraftKind, userId: string | null | undefined, values: T, now = Date.now()): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(postDraftKey(kind, userId), JSON.stringify({ savedAt: now, values } satisfies PostDraft<T>));
  } catch {
    // 容量不足・保存不可の端末では下書きを残せないだけで、入力は続けられる。
  }
}

export function clearPostDraft(kind: PostDraftKind, userId: string | null | undefined): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(postDraftKey(kind, userId));
  } catch {
    // 消せなくても、次に開いたときに破棄できる。
  }
}
