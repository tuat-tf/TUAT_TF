import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
const mocks = vi.hoisted(() => ({ backend: vi.fn() }));
vi.mock("@/lib/pc-backend", () => ({ pcBackendFetch: mocks.backend }));
import { GET, POST } from "./route";

const origin = "https://pc-app.example.test";
const subject = "17cac21b-28a3-4e61-b7fd-96a6d6c20460";
function bearer(role = "authenticated") { return `Bearer x.${Buffer.from(JSON.stringify({ role, sub: subject })).toString("base64url")}.x`; }
beforeEach(() => {
  for (const [name, value] of Object.entries({ PC_APP_RUNTIME: "true", NEXT_PUBLIC_PC_APP_RUNTIME: "true", PC_LOCAL_RUNTIME: "true", NEXT_PUBLIC_PC_LOCAL_RUNTIME: "true",
    PC_BACKEND_ENABLED: "true", NEXT_PUBLIC_PC_BACKEND: "true", APP_PUBLIC_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: `${origin}/api/pc-supabase`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-local-anon", PC_LOCAL_AUTH_URL: "http://127.0.0.1:18001", PC_LOCAL_REST_URL: "http://127.0.0.1:18002",
    IMAGE_STORAGE_DRIVER: "local", LOCAL_IMAGE_STORAGE_ROOT: resolve("..", "synthetic-images"), LOCAL_IMAGE_SIGNING_KEY: "synthetic-key-only".repeat(3),
    LOCAL_IMAGE_MAX_STORAGE_BYTES: "1000", PC_APP_SYNTHETIC_REVIEW: "true",
    NEXT_PUBLIC_PC_APP_SYNTHETIC_REVIEW: "true", SHEET_SYNC_ENABLED: "false", GOOGLE_DRIVE_CLIENT_SECRET: "", SHEET_SYNC_GAS_URL: "",
  })) vi.stubEnv(name, value);
  mocks.backend.mockReset().mockResolvedValue(Response.json([{ id: "synthetic" }]));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("same-origin PC app public REST boundary", () => {
  it("accepts the configured public Origin through loopback without forwarding caller privilege headers", async () => {
    const response = await POST(new Request("http://127.0.0.1:18182/api/pc-supabase/rest/v1/tweets", { method: "POST",
      headers: { origin, authorization: bearer(), apikey: "privileged-caller-key", "x-pc-backend-key": "caller-key",
        "x-pc-app-key": "caller-app-key", "x-tuat-mirror": "true", "x-forwarded-host": "attacker.test",
        cookie: "synthetic=private", "content-type": "application/json", prefer: "return=representation" }, body: '{"id":"synthetic"}' }));
    expect(response.status).toBe(200);
    const [target, options] = mocks.backend.mock.calls[0];
    expect(target).toBe(`${origin}/api/pc-supabase/rest/v1/tweets`);
    expect(options.headers.get("apikey")).toBe("synthetic-local-anon");
    expect(options.headers.get("authorization")).toBe(bearer());
    expect(options.headers.get("prefer")).toBe("return=representation");
    for (const name of ["cookie", "origin", "x-pc-backend-key", "x-pc-app-key", "x-tuat-mirror", "x-forwarded-host"]) expect(options.headers.has(name)).toBe(false);
  });
  it("rejects cross-origin mutations, anonymous and privileged REST before data dispatch", async () => {
    const cases: HeadersInit[] = [
      { origin: "https://attacker.test", authorization: bearer() },
      { origin, authorization: bearer("service_role") }, { origin, authorization: bearer("anon") }, { origin },
    ];
    for (const headers of cases) {
      const response = await POST(new Request(`${origin}/api/pc-supabase/rest/v1/tweets`, { method: "POST", headers }));
      expect([401, 403]).toContain(response.status);
    }
    expect(mocks.backend).not.toHaveBeenCalled();
  });
  it("refuses private Auth administration even for an authenticated member", async () => {
    const response = await GET(new Request(`${origin}/api/pc-supabase/auth/v1/admin/users`, { headers: { authorization: bearer() } }));
    expect(response.status).toBe(403);
    expect(mocks.backend).not.toHaveBeenCalled();
  });
  it("reports an unavailable save once without another destination", async () => {
    const external = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", external);
    mocks.backend.mockRejectedValue(new Error("response lost after commit"));
    const response = await POST(new Request(`${origin}/api/pc-supabase/rest/v1/tweets`, { method: "POST",
      headers: { origin, authorization: bearer() }, body: '{"id":"synthetic"}' }));
    expect(response.status).toBe(503);
    expect(mocks.backend).toHaveBeenCalledTimes(1);
    expect(external).not.toHaveBeenCalled();
  });
  it("is absent when the PC runtime is not configured", async () => {
    for (const name of ["PC_APP_RUNTIME", "NEXT_PUBLIC_PC_APP_RUNTIME", "PC_LOCAL_RUNTIME", "NEXT_PUBLIC_PC_LOCAL_RUNTIME"]) vi.stubEnv(name, "false");
    const external = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", external);
    const response = await GET(new Request(`${origin}/api/pc-supabase/rest/v1/tweets`, { headers: { authorization: bearer() } }));
    expect(response.status).toBe(404);
    expect(mocks.backend).not.toHaveBeenCalled(); expect(external).not.toHaveBeenCalled();
  });
});
