"use client";

import { format } from "date-fns";

/** 端末の下書きから続きを開いたことを知らせ、捨てて書き直す操作を出す。 */
export function DraftRestoredNotice({ savedAt, onDiscard }: { savedAt: number; onDiscard: () => void }) {
  return (
    <div role="status" className="flex items-center gap-2 rounded-xl bg-accent/5 px-3 py-1.5 text-xs text-muted">
      <span className="min-w-0 flex-1">{format(new Date(savedAt), "M/d H:mm")}の下書き</span>
      <button type="button" data-ui-action="text" data-ui-tone="danger" onClick={onDiscard} className="shrink-0 font-semibold text-danger">
        破棄
      </button>
    </div>
  );
}
