import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { sessionClientConfig } from "./server-client-options";

// This transport test starts after backup approval; the real fail-stop is tested separately.
vi.mock("../pc-backup-status", async (original) => ({
  ...await original<typeof import("../pc-backup-status")>(),
  pcAppWriteProtectionResponse: async () => null,
}));

const origin = "https://pc-app.example.test", base = `${origin}/api/pc-supabase`;
beforeEach(() => {
  for (const [name, value] of Object.entries({ PC_APP_RUNTIME: "true", NEXT_PUBLIC_PC_APP_RUNTIME: "true", PC_LOCAL_RUNTIME: "true", NEXT_PUBLIC_PC_LOCAL_RUNTIME: "true",
    PC_BACKEND_ENABLED: "true", NEXT_PUBLIC_PC_BACKEND: "true", APP_PUBLIC_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: base, NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-local-anon",
    PC_LOCAL_AUTH_URL: "http://127.0.0.1:18001", PC_LOCAL_REST_URL: "http://127.0.0.1:18002",
    IMAGE_STORAGE_DRIVER: "local", LOCAL_IMAGE_STORAGE_ROOT: resolve("..", "synthetic-images"),
    LOCAL_IMAGE_SIGNING_KEY: "synthetic-key-only".repeat(3), LOCAL_IMAGE_MAX_STORAGE_BYTES: "1000", R2_READ_ENABLED: "false", R2_WRITE_ENABLED: "false",
    PC_APP_SYNTHETIC_REVIEW: "true", NEXT_PUBLIC_PC_APP_SYNTHETIC_REVIEW: "true", SHEET_SYNC_ENABLED: "false", GOOGLE_DRIVE_CLIENT_SECRET: "", SHEET_SYNC_GAS_URL: "",
  })) vi.stubEnv(name, value);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("server PC app transport", () => {
  it("keeps the member JWT while Auth and REST go straight to their private loopback services", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([])); vi.stubGlobal("fetch", fetcher);
    const config = sessionClientConfig();
    expect(config.url).toBe(base); expect(config.key).toBe("synthetic-local-anon");
    expect(config.options.cookieOptions).toEqual({ name: "sb-pc-backend-auth" });
    const transport = (config.options.global as { fetch: typeof fetch }).fetch;
    await transport(`${base}/rest/v1/tweets?select=id`, { headers: { authorization: "Bearer synthetic-member", apikey: "synthetic-local-anon",
      cookie: "synthetic=private", "x-pc-backend-key": "caller", "x-tuat-mirror": "true", "x-forwarded-host": "attacker.test" } });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:18002/tweets?select=id");
    const headers = new Headers(init?.headers);
    expect(headers.get("apikey")).toBe("synthetic-local-anon"); expect(headers.get("authorization")).toBe("Bearer synthetic-member");
    for (const name of ["cookie", "x-pc-backend-key", "x-tuat-mirror", "x-forwarded-host"]) expect(headers.has(name)).toBe(false);
    await transport(`${base}/auth/v1/user`, { headers: { apikey: "synthetic-local-anon", authorization: "Bearer synthetic-member" } });
    expect(fetcher.mock.calls[1][0]).toBe("http://127.0.0.1:18001/user");
  });
  it("reports a loopback failure once without another destination", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("private API unavailable")); vi.stubGlobal("fetch", fetcher);
    const transport = (sessionClientConfig().options.global as { fetch: typeof fetch }).fetch;
    await expect(transport(`${base}/rest/v1/tweets`, { method: "POST", body: "{}" })).rejects.toThrow("private API unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("http://127.0.0.1:18002/tweets");
  });
  it("uses the plain configured project when no PC runtime is set", () => {
    for (const name of ["PC_APP_RUNTIME", "NEXT_PUBLIC_PC_APP_RUNTIME", "PC_LOCAL_RUNTIME", "NEXT_PUBLIC_PC_LOCAL_RUNTIME"]) vi.stubEnv(name, "");
    expect(sessionClientConfig()).toEqual({ url: base, key: "synthetic-local-anon", options: {} });
  });
});
