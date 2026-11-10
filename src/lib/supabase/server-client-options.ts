import { pcBackendFetch } from "../pc-backend";
import { getPcAppRuntime } from "../pc-app-runtime";
import { createAuthRefreshFetch } from "./auth-fetch";

/**
 * サーバー側（Server Component・Route Handler・proxy）でログイン中の部員として使う Supabase クライアントの設定。
 * server.ts と middleware.ts で同じものを使う。本番（PC）ではログインもデータもPC内のAPIへ送る。
 */
export function sessionClientConfig(): { url: string; key: string; options: Record<string, unknown> } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!getPcAppRuntime()) return { url, key, options: {} };
  return { url, key, options: {
    cookieOptions: { name: "sb-pc-backend-auth" }, global: { fetch: createAuthRefreshFetch(pcBackendFetch, url) },
  } };
}
