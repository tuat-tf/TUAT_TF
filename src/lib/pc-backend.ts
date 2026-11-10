import { getPcAppRuntime } from "./pc-app-runtime";
import { pcLocalApiTarget } from "./pc-local-runtime";
import { pcAppWriteProtectionResponse, pcBackendRequestNeedsProtection } from "./pc-backup-status";

/** Server-side dispatch to the PC-local Auth/REST services. No automatic replay: even a failed response may follow a committed write. */
export async function pcBackendFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const source = new URL(request.url);
  const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
  if (source.origin !== base.origin || !source.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`)) throw new Error("Invalid backend destination");
  const path = source.pathname.slice(base.pathname.replace(/\/$/, "").length);
  if (!/^\/(auth|rest|storage|functions)\/v1(?:\/|$)/.test(path)) throw new Error("Invalid backend API");
  const app = getPcAppRuntime();
  if (!app) throw new Error("PC backend requires the local runtime");
  // Token refresh/logout must remain possible while business writes are protected.
  if (!path.startsWith("/auth/v1/") && await pcBackendRequestNeedsProtection(request, path)) {
    const protectedResponse = await pcAppWriteProtectionResponse();
    if (protectedResponse) return protectedResponse;
  }
  const headers = new Headers(request.headers);
  for (const name of ["host", "cookie", "x-pc-browser", "x-pc-backend-key", "x-pc-app-key", "x-tuat-app-public-origin", "x-tuat-mirror", "forwarded", "x-tuat-backend", "x-tuat-app-backend"]) headers.delete(name);
  for (const name of Array.from(headers.keys())) if (name.startsWith("x-forwarded-")) headers.delete(name);
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer();
  return fetch(pcLocalApiTarget(app.local, path, source.search), {
    method: request.method, headers, body, cache: "no-store", redirect: "manual",
    signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
  });
}
