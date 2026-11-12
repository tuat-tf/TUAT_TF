"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** フォーム下部の主ボタン（進行中はスピナーつき） */
export function FestivalSaveButton({ saving, editing, disabled, onClick }: { saving: boolean; editing: boolean; disabled?: boolean; onClick: () => void }) {
  const verb = editing ? "更新" : "作成";
  return (
    <Button size="lg" onClick={onClick} disabled={saving || disabled}>
      {saving && <LoaderCircle size={18} className="animate-spin" />}
      {saving ? `${verb}中…` : `${verb}する`}
    </Button>
  );
}

/** ほかの人の操作を読み直す（自動では更新しない） */
export function FestivalRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      data-ui-action
      type="button"
      aria-label="最新の状態に更新"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="pressable flex h-11 w-11 items-center justify-center text-accent disabled:opacity-50"
    >
      <RefreshCw size={19} className={pending ? "animate-spin" : ""} />
    </button>
  );
}

export const SAVE_ERROR = "保存できませんでした。もう一度お試しください";
