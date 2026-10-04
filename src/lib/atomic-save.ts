export type AtomicSaveReason = "conflict" | "forbidden" | "invalid" | "failed" | "unknown";
export type AtomicSaveState = { uncertain: boolean };
export type AtomicSaveResult<T> = { ok: true; value: T } | { ok: false; reason: AtomicSaveReason };

/** An uncertain response may only be read back, never blindly submitted again. */
export async function atomicSave<T>(
  state: AtomicSaveState,
  write: () => Promise<{ data: T | null; error: { code?: string } | null }>,
  confirm: () => Promise<T | null>,
): Promise<AtomicSaveResult<T>> {
  if (!state.uncertain) {
    try {
      const result = await write();
      if (!result.error && result.data !== null) return { ok: true, value: result.data };
      // SQL errors roll the entire RPC transaction back. Transport errors do not establish that.
      if (result.error?.code && /^[A-Z0-9]{5}$/.test(result.error.code)) {
        const code = result.error.code;
        return { ok: false, reason: code === "40001" ? "conflict" : code === "42501" ? "forbidden" : code === "23514" ? "invalid" : "failed" };
      }
    } catch { /* The server may already have committed. */ }
    state.uncertain = true;
  }
  try {
    const confirmed = await confirm();
    if (confirmed !== null) {
      state.uncertain = false;
      return { ok: true, value: confirmed };
    }
  } catch { /* Preserve the uncertain operation and the input. */ }
  return { ok: false, reason: "unknown" };
}

export function atomicSaveMessage(reason: AtomicSaveReason): string {
  if (reason === "conflict") return "ほかの端末で変更されています。入力を確認してから画面を開き直してください";
  if (reason === "forbidden") return "この変更を保存する権限がありません";
  if (reason === "invalid") return "入力内容や投票の変更を確認してください。票が入った選択肢は外せません";
  if (reason === "unknown") return "保存結果を確認できません。入力は残っています。もう一度保存を押すと、再送せず結果だけ確認します";
  return "保存できませんでした。入力は残っています";
}
