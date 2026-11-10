import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedPcBrowserApi, isMemberBearer } from "./pc-browser-api";

afterEach(() => vi.unstubAllEnvs());
describe("PC backend boundary", () => {
  const instance = "17cac21b-28a3-4e61-b7fd-96a6d6c20460";
  it("does not expose admin, password, signup, functions, storage writes or encoded paths to browsers", () => {
    const query = new URLSearchParams();
    for (const path of ["/auth/v1/admin/users", "/auth/v1/signup", "/auth/v1/otp", "/functions/v1/send-web-push", "/storage/v1/object/test", "/rest/v1/%2e%2e/auth", "/rest/v1/../auth", "/rest/v1/a%2Fb"]) {
      expect(allowedPcBrowserApi(path, "POST", query)).toBe(false);
    }
    expect(allowedPcBrowserApi("/auth/v1/token", "POST", new URLSearchParams("grant_type=password"))).toBe(false);
    expect(allowedPcBrowserApi("/auth/v1/token", "POST", new URLSearchParams("grant_type=pkce"))).toBe(true);
    expect(allowedPcBrowserApi("/auth/v1/token", "POST", new URLSearchParams("grant_type=refresh_token"))).toBe(true);
    expect(allowedPcBrowserApi("/auth/v1/authorize", "GET", new URLSearchParams("provider=google"))).toBe(true);
    expect(allowedPcBrowserApi("/rest/v1/competition_goals", "PATCH", query)).toBe(true);
  });
  it("rejects privileged and malformed bearer tokens before forwarding", () => {
    const bearer = (role: string) => `Bearer x.${Buffer.from(JSON.stringify({ role, sub: instance })).toString("base64url")}.x`;
    expect(isMemberBearer(bearer("service_role"))).toBe(false);
    expect(isMemberBearer(bearer("anon"))).toBe(false);
    expect(isMemberBearer("Bearer invalid")).toBe(false);
    expect(isMemberBearer(bearer("authenticated"))).toBe(true);
  });
});
