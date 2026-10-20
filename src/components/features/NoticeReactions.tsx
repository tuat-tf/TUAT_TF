"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NoticeAcknowledgersSheet } from "@/components/features/NoticeAcknowledgersSheet";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { NoticeReaction } from "@/types";
import { saveNoticeReaction, type PendingNoticeReaction } from "@/lib/notice-reaction-save";

export function NoticeReactions({ noticeId, userId, initialCounts, initialMine }: {
  noticeId: string;
  userId: string;
  initialCounts: Record<NoticeReaction, number>;
  initialMine: NoticeReaction[];
}) {
  const [count, setCount] = useState(initialCounts.ack);
  const [checked, setChecked] = useState(initialMine.includes("ack"));
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingNoticeReaction | null>(null);
  const saveLock = useRef(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const { showToast } = useToast();
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  useEffect(() => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);

  function startPress() {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setPeopleOpen(true);
    }, 450);
  }

  function cancelPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function handleClick() {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    void toggle();
  }

  async function toggle() {
    if (saveLock.current) return;
    saveLock.current = true;
    setBusy(true);
    const attempt = pending ?? { checked: !checked, uncertain: false };
    try {
      const result = await saveNoticeReaction(createClient(), noticeId, userId, attempt);
      if (!result.ok) {
        setPending(result.reason === "unknown" ? attempt : null);
        showToast(result.reason === "unknown"
          ? "保存結果を確認できませんでした。もう一度押すと結果だけ確認します。"
          : "確認を保存できませんでした。時間をおいてもう一度お試しください。");
        return;
      }
      setPending(null);
      setChecked(attempt.checked);
      setCount(current => Math.max(0, current + (attempt.checked === checked ? 0 : attempt.checked ? 1 : -1)));
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <button
        data-ui-reaction
        type="button"
        onClick={handleClick}
        onPointerDown={(event) => { event.preventDefault(); startPress(); }}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(event) => event.preventDefault()}
        disabled={busy}
        aria-pressed={checked}
        aria-label={pending ? "保存結果を確認。長押しで確認した人を表示" : checked ? "確認済みを取り消す。長押しで確認した人を表示" : "確認済みにする。長押しで確認した人を表示"}
        className={cn(
          "flex select-none touch-manipulation items-center gap-1.5 text-[13px] pressable disabled:opacity-50 [-webkit-touch-callout:none]",
          checked ? "text-accent" : "text-muted",
        )}
      >
        <Check size={18} strokeWidth={checked ? 3 : 2} />
        <span className={cn("inline-block w-5 text-left tabular-nums", count === 0 && "opacity-0")}>{count}</span>
        {pending && <span className="text-micro">結果を確認</span>}
      </button>
      <NoticeAcknowledgersSheet noticeId={noticeId} open={peopleOpen} onOpenChange={setPeopleOpen} />
    </>
  );
}
