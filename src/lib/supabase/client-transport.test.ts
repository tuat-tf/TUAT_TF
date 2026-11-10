import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ browserClient: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createBrowserClient: mocks.browserClient }));
import { createClient } from "./client";

const origin = "https://pc-app.example.test";
beforeEach(() => {
  for (const [name, value] of Object.entries({ NEXT_PUBLIC_PC_APP_RUNTIME: "true", NEXT_PUBLIC_PC_LOCAL_RUNTIME: "true", NEXT_PUBLIC_PC_BACKEND: "true",
    NEXT_PUBLIC_PC_APP_SYNTHETIC_REVIEW: "true", NEXT_PUBLIC_SUPABASE_URL: `${origin}/api/pc-supabase`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-local-anon",
  })) vi.stubEnv(name, value);
  vi.stubGlobal("window", { location: { origin } });
  mocks.browserClient.mockClear();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

function transport(): typeof fetch {
  createClient();
  const [url, key, options] = mocks.browserClient.mock.calls[0];
  expect(url).toBe(`${origin}/api/pc-supabase`); expect(key).toBe("synthetic-local-anon");
  expect(options.cookieOptions).toEqual({ name: "sb-pc-backend-auth" });
  return options.global.fetch;
}

describe("browser PC app client", () => {
  it("sends Auth and REST to the same origin once, without another destination", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    const call = transport();
    const response = await call(`${origin}/api/pc-supabase/rest/v1/tweets?select=id`, { method: "POST", body: "{}" });
    expect(response.status).toBe(503); expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`${origin}/api/pc-supabase/rest/v1/tweets?select=id`);
    await expect(call("https://other.example.test/rest/v1/tweets")).rejects.toThrow("same application origin");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("refuses server-side use of the browser client", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({})); vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("window", undefined);
    createClient();
    const call: typeof fetch = mocks.browserClient.mock.calls[0][2].global.fetch;
    await expect(call(`${origin}/api/pc-supabase/rest/v1/tweets?select=id`)).rejects.toThrow("server Supabase client");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("connects directly only when no PC runtime is configured", () => {
    for (const name of ["NEXT_PUBLIC_PC_APP_RUNTIME", "NEXT_PUBLIC_PC_LOCAL_RUNTIME", "NEXT_PUBLIC_PC_BACKEND"]) vi.stubEnv(name, "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    createClient();
    expect(mocks.browserClient.mock.calls[0]).toEqual(["http://127.0.0.1:54321", "synthetic-local-anon"]);
  });
});
