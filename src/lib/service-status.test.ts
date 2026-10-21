import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/image-storage", () => ({ getR2Inventory: vi.fn() }));
import { getServiceStatus, parseHealth, parseVercelUsage } from "./service-status";
import { getR2Inventory } from "./image-storage";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("service status summaries", () => {
  it("does not call retired cloud providers or billing APIs for the club PC runtime", async () => {
    vi.stubEnv("PC_LOCAL_RUNTIME", "true");
    vi.stubEnv("IMAGE_STORAGE_DRIVER", "local");
    vi.stubEnv("VERCEL_MONITORING_TOKEN", "unused-fixture-token");
    vi.stubEnv("SERVICE_STATUS_VERCEL_TEAM_ID", "unused-fixture-team");
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: { indicator: "none" } }) });
    vi.stubGlobal("fetch", fetcher);
    vi.mocked(getR2Inventory).mockResolvedValue({ bytes: 123, objects: 2 });
    const result = await getServiceStatus();
    expect(result.runtime).toBe("pc");
    expect(result.images.backend).toBe("pc");
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["https://www.cloudflarestatus.com/api/v2/summary.json"]);
    expect(JSON.stringify(result)).not.toContain("unused-fixture");
  });
  it("reports local image capacity and pause state without requiring R2 credentials", async () => {
    vi.stubEnv("IMAGE_STORAGE_DRIVER", "local");
    vi.stubEnv("R2_ACCOUNT_ID", "");
    vi.stubEnv("LOCAL_IMAGE_MAX_STORAGE_BYTES", "9000000");
    vi.stubEnv("LOCAL_IMAGE_UPLOADS_PAUSED", "true");
    vi.stubEnv("SERVICE_STATUS_VERCEL_TOKEN", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({status:{indicator:"none"}}) }));
    vi.mocked(getR2Inventory).mockResolvedValue({bytes:123,objects:2});
    const result=await getServiceStatus();
    expect(result.r2).toEqual({state:"ready",bytes:123,objects:2});
    expect(result.images).toMatchObject({backend:"pc",reads:true,writes:true,paused:true,limitBytes:9000000});
  });
  it("does not treat malformed status as healthy", () => {
    for (const value of [null, {}, { status: {} }, { status: { indicator: "new-value" } }]) expect(() => parseHealth(value)).toThrow();
    expect(parseHealth({ status: { indicator: "major" }, incidents: [{ name: "Database outage" }] })).toEqual({ indicator: "major", incidents: ["Database outage"] });
  });
  it("aggregates usage across projects without mixing units or credits", () => {
    const usage = (quantity: string, unit = "requests") => ({ ChargeCategory: "Usage", ServiceName: "Functions", ConsumedQuantity: quantity, ConsumedUnit: unit });
    const rows = [usage("12"), usage("8"), usage("0.5", "hours"), { ...usage("100"), ChargeCategory: "Credit" }, { ...usage("0"), ConsumedQuantity: null, ConsumedUnit: null }];
    expect(parseVercelUsage(rows.map((row) => JSON.stringify(row)).join("\n"))).toEqual([
      { name: "Functions", unit: "requests", quantity: 20 }, { name: "Functions", unit: "hours", quantity: 0.5 },
    ]);
  });
  it("rejects incomplete usage rather than inventing zero", () => {
    expect(() => parseVercelUsage("not JSON")).toThrow();
    for (const quantity of ["", "NaN", -3, undefined]) expect(() => parseVercelUsage(JSON.stringify({ ChargeCategory: "Usage", ServiceName: "CPU", ConsumedUnit: "hours", ConsumedQuantity: quantity }))).toThrow();
  });
});
