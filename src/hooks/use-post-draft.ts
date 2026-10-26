"use client";

import { useCallback, useEffect, useRef } from "react";
import { clearPostDraft, writePostDraft, type PostDraftKind } from "@/lib/post-drafts";

/**
 * 入力中の内容を端末の下書きへ書き続ける。入力が止まって少ししたら保存し、アプリを閉じたとき・
 * フォームを閉じたときもその場で保存する。空になったら下書きを消す。
 * userId が null のとき（編集・引用など下書きを持たない画面）は何もしない。
 */
export function usePostDraft<T>(kind: PostDraftKind, userId: string | null, values: T, empty: boolean) {
  const latest = useRef({ values, empty });
  const stopped = useRef(false);

  const flush = useCallback(() => {
    if (!userId || stopped.current) return;
    const current = latest.current;
    if (current.empty) clearPostDraft(kind, userId);
    else writePostDraft(kind, userId, current.values);
  }, [kind, userId]);

  useEffect(() => {
    latest.current = { values, empty };
    if (!userId || stopped.current) return;
    const timer = window.setTimeout(flush, 400);
    return () => window.clearTimeout(timer);
  }, [values, empty, userId, flush]);

  useEffect(() => {
    if (!userId) return;
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
      // フォームを閉じたときも、待っている最後の入力まで残す。
      flush();
    };
  }, [flush, userId]);

  /** 投稿できた・破棄して閉じるとき。以後このフォームでは下書きを書かない。 */
  const finish = useCallback(() => {
    stopped.current = true;
    clearPostDraft(kind, userId);
  }, [kind, userId]);

  /** 復元した下書きを捨てて書き直すとき。以後の入力はまた下書きに残る。 */
  const clear = useCallback(() => clearPostDraft(kind, userId), [kind, userId]);

  return { finish, clear };
}
