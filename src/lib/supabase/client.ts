import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { createCoalescedFetch } from "@/lib/coalesced-fetch";
import { pcAppLocalAuthEnabled } from "@/lib/pc-app-transport";
import { createAuthRefreshFetch } from "./auth-fetch";

const coalescedFetch = createCoalescedFetch((input, init) => {
  if (typeof window === "undefined") throw new Error("PC app server requests must use the server Supabase client");
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/pc-supabase/")) throw new Error("Local Auth and data require the same application origin");
  return fetch(input, init);
});

/** ブラウザ（Client Component）用 Supabase クライアント */
export function createClient() {
  if (!pcAppLocalAuthEnabled()) {
    // PCの設定がない開発環境だけ、指定のSupabaseへ直接つなぐ。
    return createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  const url = typeof window === "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL! : `${window.location.origin}/api/pc-supabase`;
  return createBrowserClient<Database>(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { name: "sb-pc-backend-auth" }, global: { fetch: createAuthRefreshFetch(coalescedFetch, url) },
  });
}
