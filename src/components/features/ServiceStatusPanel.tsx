"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { ServiceHealth, ServiceStatus } from "@/lib/service-status";

const healthLabels = { none: "全体の稼働は正常", minor: "一部に影響あり", major: "サービス全体で障害情報あり", critical: "サービス全体で重大な障害情報あり", unknown: "障害情報を取得できません" };
const gb = (n: number) => `${(n / 1_000_000_000).toLocaleString("ja-JP", { maximumFractionDigits: 3 })} GB`;

export function ServiceStatusPanel({ embedded = false }: { embedded?: boolean }) {
  const query = useQuery<ServiceStatus>({
    queryKey: ["admin-service-status"],
    queryFn: async () => {
      const response = await fetch("/api/admin/services", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "システム管理権限が必要です" : "状態を取得できませんでした。時間をおいて再確認してください。");
      return response.json();
    },
    staleTime: 15 * 60 * 1000, gcTime: 0, retry: false, refetchOnWindowFocus: false,
  });
  const data = query.data;
  return <div className={embedded ? "space-y-4" : "space-y-4 px-4 pb-8 pt-1"}>
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm text-muted">システム管理者だけが確認できます。障害情報は各サービス全体の状況です。</p>
      <button data-ui-action type="button" disabled={query.isFetching} onClick={() => void query.refetch()} className="flex shrink-0 items-center gap-1 rounded-lg border border-separator px-3 py-2 text-sm disabled:opacity-50">
        <RefreshCw size={14} className={query.isFetching ? "animate-spin" : ""} />再確認
      </button>
    </div>
    {query.isPending && <p role="status" className="text-sm text-muted">確認中…</p>}
    {query.isError && <p role="alert" className="text-sm text-danger">{query.error.message}</p>}
    {data && <>
      <p className="text-micro text-muted">取得日時: {new Date(data.checkedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（日本時間）<br />通信量を抑えるため、結果を15分間再利用します。</p>
      <Card className="space-y-3 p-4">
        <h2 className="text-base font-bold">本番PC</h2>
        <p className="text-sm">アプリ・ログイン認証・記録・画像が稼働しています。</p>
        <ImageUsage data={data} />
      </Card>
      <ServiceCard name="Cloudflare（全サービス）" health={data.health.cloudflare} statusUrl="https://www.cloudflarestatus.com" usageUrl="https://dash.cloudflare.com/f08f553737bd866b3a6f4ce1f94a8be3" usageLabel="部活の管理画面を開く">
        <p className="text-sm">アプリの公開URLと本番PCへの接続を管理します。</p>
        <p className="text-micro text-muted">月間の操作回数・アカウント全体の無料枠残量は「部活の管理画面を開く」で確認できます。</p>
      </ServiceCard>
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-bold">Google Drive</h2>
          <p className="text-sm">暗号化バックアップと復旧資材の保存先です。部活のGoogleアカウントで開いてください。</p>
          <p className="text-micro text-muted">保存されたファイルと空き容量はGoogle Driveで確認できます。容量はGmail・Googleフォトなどと共有します。</p>
          <div data-ui-group className="flex flex-wrap gap-4 border-t border-separator pt-3 text-sm">
            <ManagementLink href="https://drive.google.com/drive/folders/1o5pLXSJqMehrRVZ9k250S9jjFpCXqhDS">バックアップを開く</ManagementLink>
            <ManagementLink href="https://drive.google.com/file/d/1h7PQH3mmAydy5YpBNbtHIPmM0wP8zCJU/view">引き継ぎ・復旧手順を開く</ManagementLink>
          </div>
        </Card>
        <Card className="space-y-3 p-4">
          <h2 className="text-base font-bold">運用アカウント</h2>
          <div data-ui-group className="flex flex-wrap gap-4 text-sm">
            <ManagementLink href="https://github.com/tuat-tf/TUAT_TF">GitHubを開く</ManagementLink>
            <ManagementLink href="https://console.cloud.google.com/apis/credentials?project=tuat-tf">Googleログインの設定を開く</ManagementLink>
          </div>
        </Card>
    </>}
  </div>;
}

function ImageUsage({ data }: { data: ServiceStatus }) {
  const { inventory, images } = data;
  return <>
    {inventory.state === "ready" ? <>
      <div className="flex justify-between gap-3 text-sm"><span>画像の保存容量</span><strong>{gb(inventory.bytes!)} / {images.limitBytes === null ? "上限設定エラー" : gb(images.limitBytes)}</strong></div>
      {images.limitBytes !== null && <progress aria-label="画像保存容量の使用率" max={images.limitBytes} value={inventory.bytes!} className="h-2 w-full accent-current" />}
      <p className="text-micro text-muted">{inventory.objects!.toLocaleString("ja-JP")}ファイル。上限はアプリの保存停止目安です。保存先: 本番PC。</p>
      {images.limitBytes !== null && inventory.bytes! >= images.limitBytes * 0.8 && <p className="text-sm text-warning">保存容量が停止目安の80%以上です。</p>}
    </> : <p className="text-sm text-muted">保存容量: 取得できませんでした</p>}
    <dl className="grid grid-cols-2 gap-2 text-sm">
      <dt>新しい画像の保存</dt><dd>{images.paused ? "一時停止中" : "本番PC"}</dd>
    </dl>
  </>;
}

function ManagementLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a data-ui-action href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">{children}<ExternalLink size={13} /></a>;
}

function ServiceCard({ name, health, statusUrl, usageUrl, usageLabel = "使用量を開く", children }: { name: string; health: ServiceHealth; statusUrl: string; usageUrl: string; usageLabel?: string; children: React.ReactNode }) {
  return <Card className="space-y-3 p-4">
    <h2 className="text-base font-bold">{name}</h2>
    <p className={`text-sm font-semibold ${health.indicator === "none" ? "text-success" : health.indicator === "unknown" ? "text-muted" : "text-warning"}`}>{healthLabels[health.indicator]}</p>
    <p className="text-micro text-muted">提供元の全地域・全サービスの発表です。このアプリへの影響を確認した結果ではありません。</p>
    {health.incidents.length > 0 && <ul className="list-disc space-y-1 pl-4 text-micro text-muted">{health.incidents.map((incident, index) => <li key={index}>{incident}</li>)}</ul>}
    {children}
    <div data-ui-group className="flex flex-wrap gap-4 border-t border-separator pt-3 text-sm">
      <ManagementLink href={usageUrl}>{usageLabel}</ManagementLink>
      <a data-ui-action href={statusUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-muted">障害情報<ExternalLink size={13} /></a>
    </div>
  </Card>;
}
