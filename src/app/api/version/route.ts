// 現在デプロイされているバージョン（コミットSHA）を返す。
// クライアントが定期的に取得し、起動時と異なれば「更新あり」と判断する。
//
// 値はデプロイごとに固定なので、ビルド時に焼き付けた静的ファイルとして配信する。
// 動的ルートのままだと、部員の端末が定期的に叩くたびにサーバーの処理が動く。
// VERCEL_GIT_COMMIT_SHA は名前だけ旧来のまま、本番PCの反映（pc-release.py）がcommit SHAを入れている。
export const dynamic = "force-static";

export async function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    "dev";
  const payload = process.env.PC_APP_RUNTIME === "true"
    ? { version, releaseId: process.env.PC_APP_RELEASE_ID }
    : { version };
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
  });
}
