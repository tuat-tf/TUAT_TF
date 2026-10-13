"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function DashboardRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button data-ui-action type="button" aria-label="利用状況を再確認" disabled={pending} onClick={() => startTransition(() => router.refresh())} className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-separator px-3 py-2 text-sm disabled:opacity-50">
    <RefreshCw size={14} className={pending ? "animate-spin" : ""} />{pending ? "確認中…" : "再確認"}
  </button>;
}
