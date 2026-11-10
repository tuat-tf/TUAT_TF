import type { NextConfig } from "next";
import { configuredAppPublicOrigin } from "./src/lib/app-public-origin";
import { getPcAppRuntime } from "./src/lib/pc-app-runtime";

const pcApp = getPcAppRuntime();
const publicOrigin = configuredAppPublicOrigin();
const releaseId = process.env.PC_APP_RELEASE_ID;
if (releaseId && (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(releaseId) || releaseId.startsWith("dpl_"))) {
  throw new Error("PC_APP_RELEASE_ID must be at most 32 characters and cannot start with dpl_");
}

const nextConfig: NextConfig = {
  ...(publicOrigin ? { experimental: { serverActions: { allowedOrigins: [new URL(publicOrigin).host] } } } : {}),
  ...(pcApp && releaseId ? { deploymentId: releaseId } : {}),
  // 注意: cacheComponents(PPR) は有効化しない。
  // 2026-07-12 00:14 に「タブ復元の高速化」目的で有効化した直後から、実機iOS PWAで
  // 「別タブ→ホームで毎回完全フリーズ」「予定/タイムラインのフリーズ」「リロード時の
  // 配置ガクつき」が発生した（AGENTS.mdの「やらないこと」参照）。
  // Tab Lab実測で「Routerを通さない実DOM再構築は最大75msで安定」＝問題はRouter/PPR層と
  // 切り分け済み。IDB永続化・Server Action・prefetch・PullToRefresh・staleTimesを
  // 全て撤去しても再現したため、最後に残ったこの層を無効化して検証する。
  // タブ切替の速さは①Vercel関数の東京リージョン固定（vercel.json）
  // ②各画面のreact-queryセッションキャッシュ ③loading.tsxスケルトンで担保する。
  //
  // 同様に experimental.staleTimes も再導入しないこと（同日の教訓）。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // 親ドメイン(workers.dev)は共有のため includeSubDomains / preload は付けない。
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
