import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/image-storage", () => ({ getImageInventory: vi.fn() }));
import { getServiceStatus, parseHealth } from "./service-status";
import { getImageInventory } from "./image-storage";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("service status summaries", () => {
  it("asks only the provider that fronts the PC and reports local image capacity and pause state", async () => {
    vi.stubEnv("LOCAL_IMAGE_MAX_STORAGE_BYTES", "9000000");
    vi.stubEnv("LOCAL_IMAGE_UPLOADS_PAUSED", "true");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: { indicator: "none" } }) });
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(getImageInventory).mockResolvedValue({ bytes: 123, objects: 2 });
    const result = await getServiceStatus();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["https://www.cloudflarestatus.com/api/v2/summary.json"]);
    expect(result.inventory).toEqual({ state: "ready", bytes: 123, objects: 2 });
    expect(result.images).toEqual({ paused: true, limitBytes: 9000000 });
  });
  it("reports an unreadable image inventory as an error rather than zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    vi.mocked(getImageInventory).mockRejectedValue(new Error("unavailable"));
    const result = await getServiceStatus();
    expect(result.inventory).toEqual({ state: "error", bytes: null, objects: null });
    expect(result.health.cloudflare.indicator).toBe("unknown");
  });
  it("does not treat malformed status as healthy", () => {
    for (const value of [null, {}, { status: {} }, { status: { indicator: "new-value" } }]) expect(() => parseHealth(value)).toThrow();
    expect(parseHealth({ status: { indicator: "major" }, incidents: [{ name: "Database outage" }] })).toEqual({ indicator: "major", incidents: ["Database outage"] });
  });
});
