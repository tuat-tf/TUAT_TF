"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type Health = {
  latest: null | {
    status: string;
    startedAt: string;
    finishedAt: string | null;
    pulledCount: number;
    pushedCount: number;
    failedCount: number;
    hasIssue: boolean;
  };
  pendingPushCount: number;
  sheetProfileCount: number;
};

export function SystemSyncStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    fetch("/api/sheets/sync-status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<Health>;
      })
      .then((data) => { if (active) setHealth(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [refreshKey]);

  const latest = health?.latest;
  const running = latest?.status === "running";
  const pending = !!health && health.pendingPushCount > 0;
  const issue = !!latest?.hasIssue || pending;
  const successful = latest?.status === "success" && !!latest.finishedAt && !issue;
  const label = error ? "状態を取得できません" : !health ? "確認中…"
    : !latest ? "実行履歴はありません" : running ? "連携を実行中です"
      : latest.hasIssue ? "最終実行に未解消のエラーがあります"
        : !latest.finishedAt ? "最終実行の完了を確認できません"
          : latest.status === "success" ? "最終実行は完了しました"
            : latest.status === "error" ? "最終実行のエラーは解消済みです"
              : "最終実行の結果を確認できません";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-micro text-muted2">スプレッドシート連携の状態</p>
        <button data-ui-action="icon" data-ui-size="icon" type="button" onClick={() => { setError(false); setHealth(null); setRefreshKey((key) => key + 1); }} className="p-1 text-muted pressable" aria-label="連携状態を再確認">
          <RefreshCw size={15} />
        </button>
      </div>
      <div data-ui-panel className="rounded-xl border border-separator bg-card p-3">
        <div className="flex items-center gap-2">
          {error ? <AlertTriangle size={18} className="shrink-0 text-danger" />
            : !health ? <LoaderCircle size={18} className="shrink-0 animate-spin text-muted" />
              : issue ? <AlertTriangle size={18} className="shrink-0 text-warning" />
                : successful ? <CheckCircle2 size={18} className="shrink-0 text-success" />
                  : <Activity size={18} className="shrink-0 text-muted" />}
          <span role="status" className="text-[14px] font-semibold">{label}</span>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-danger">時間をおいて再確認してください</p>}
        {pending && <p className="mt-2 text-sm text-warning">未書き込みの記録があります</p>}
        {health && <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Metric label="スプレッドシート連携" value={`${health.sheetProfileCount}人`} />
          <Metric label="未書き込み" value={`${health.pendingPushCount}件`} danger={health.pendingPushCount > 0} />
          <Metric label="未解消エラー" value={latest ? `${latest.failedCount}人` : "—"} danger={!!latest && latest.failedCount > 0} />
        </div>}
        {latest && <div className="mt-3 space-y-1 text-micro text-muted">
          <p>{running || !latest.finishedAt ? "開始日時" : "完了日時"}: {new Date(running || !latest.finishedAt ? latest.startedAt : latest.finishedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（日本時間）</p>
          {!running && latest.finishedAt && <p>取り込み {latest.pulledCount}件 / 書き込み {latest.pushedCount}件</p>}
        </div>}
      </div>
    </div>
  );
}

function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return <div className="rounded-lg bg-bg px-1 py-2"><span className="block text-micro text-muted">{label}</span><span className={cn("mt-0.5 block text-[15px] font-bold tabular-nums", danger && "text-danger")}>{value}</span></div>;
}
