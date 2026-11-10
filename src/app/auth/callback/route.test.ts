import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ client: vi.fn(), access: vi.fn(),
  signOut: vi.fn(), profile: vi.fn(), upsert: vi.fn(), runtime: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/login-access", () => ({ loginAccessStatus: mocks.access }));
vi.mock("@/lib/pc-app-runtime", () => ({ getPcAppRuntime: mocks.runtime }));
import { GET } from "./route";

const id = "17cac21b-28a3-4e61-b7fd-96a6d6c20460";
const user = { id, email: "allowed-external@example.test", user_metadata: { name: "Synthetic" } };
const origin = "https://pc-app.example.test";
const request = () => new NextRequest("http://127.0.0.1:18182/auth/callback?code=synthetic&next=%2Fhome");
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_PUBLIC_ORIGIN", origin);
  mocks.runtime.mockReturnValue({ local: { authUrl: "http://127.0.0.1:18001", restUrl: "http://127.0.0.1:18002" } });
  mocks.access.mockResolvedValue("allowed");
  mocks.profile.mockReset().mockResolvedValue({ data: { id, display_name: "Synthetic", blocks: ["middle"] }, error: null });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.client.mockResolvedValue({ auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user } }), signOut: mocks.signOut },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: mocks.profile })) })), upsert: mocks.upsert })) });
});
afterEach(() => vi.unstubAllEnvs());

describe("PC app first-login identity", () => {
  it("keeps the completed OAuth login on the public application origin", async () => {
    for (const next of ["@other.invalid/", "//other.invalid/", "/\\other.invalid/"]) {
      const response = await GET(new NextRequest(`http://127.0.0.1:18182/auth/callback?code=synthetic&next=${encodeURIComponent(next)}`));
      expect(response.headers.get("location")).toBe(`${origin}/home`);
    }
  });
  it("checks the allowlist before reading the profile", async () => {
    const response = await GET(request());
    expect(response.headers.get("location")).toBe(`${origin}/home`);
    expect(mocks.access.mock.invocationCallOrder[0]).toBeLessThan(mocks.profile.mock.invocationCallOrder[0]);
  });
  it("does not admit denied external users or erase valid sessions on an unavailable allowlist", async () => {
    mocks.access.mockResolvedValueOnce("denied");
    const denied = await GET(request());
    expect(denied.headers.get("location")).toBe(`${origin}/login?error=domain`);
    expect(mocks.signOut).toHaveBeenCalledTimes(1); expect(mocks.profile).not.toHaveBeenCalled();
    mocks.signOut.mockClear(); mocks.access.mockResolvedValueOnce("unavailable");
    expect((await GET(request())).status).toBe(503);
    expect(mocks.signOut).not.toHaveBeenCalled(); expect(mocks.profile).not.toHaveBeenCalled();
  });
  it("does not turn profile acquisition failure into profile creation", async () => {
    mocks.profile.mockResolvedValueOnce({ data: null, error: { code: "unavailable" } });
    expect((await GET(request())).status).toBe(503); expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
