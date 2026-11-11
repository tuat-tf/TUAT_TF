import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import { getPcAppRuntime } from "./pc-app-runtime";

const origin = "https://pc-app.example.test";
function configured() {
  for (const [name, value] of Object.entries({
    PC_APP_RUNTIME: "true", NEXT_PUBLIC_PC_APP_RUNTIME: "true", PC_LOCAL_RUNTIME: "true", NEXT_PUBLIC_PC_LOCAL_RUNTIME: "true",
    PC_BACKEND_ENABLED: "true", NEXT_PUBLIC_PC_BACKEND: "true",
    APP_PUBLIC_ORIGIN: origin, NEXT_PUBLIC_SUPABASE_URL: `${origin}/api/pc-supabase`, NEXT_PUBLIC_SUPABASE_ANON_KEY: "synthetic-local-anon",
    PC_LOCAL_AUTH_URL: "http://127.0.0.1:18001", PC_LOCAL_REST_URL: "http://127.0.0.1:18002",
    IMAGE_STORAGE_DRIVER: "local", LOCAL_IMAGE_STORAGE_ROOT: resolve("..", "synthetic-images"),
    LOCAL_IMAGE_SIGNING_KEY: "synthetic-key-only".repeat(3), LOCAL_IMAGE_MAX_STORAGE_BYTES: "1000",
   
    PC_APP_SYNTHETIC_REVIEW: "true", NEXT_PUBLIC_PC_APP_SYNTHETIC_REVIEW: "true", SHEET_SYNC_ENABLED: "false",
    GOOGLE_DRIVE_CLIENT_SECRET: "", SHEET_SYNC_GAS_URL: "",
  })) vi.stubEnv(name, value);
}
beforeEach(configured);
afterEach(() => vi.unstubAllEnvs());

describe("PC app configuration", () => {
  it("uses the fixed public origin with private local Auth and REST", () => {
    expect(getPcAppRuntime()).toEqual({ publicOrigin: origin, internalUrl: "http://127.0.0.1:18002",
      local: { authUrl: "http://127.0.0.1:18001", restUrl: "http://127.0.0.1:18002" }, synthetic: true });
  });
  it("stays disabled without the runtime flags", () => {
    for (const name of ["PC_APP_RUNTIME", "NEXT_PUBLIC_PC_APP_RUNTIME", "PC_LOCAL_RUNTIME", "NEXT_PUBLIC_PC_LOCAL_RUNTIME"]) vi.stubEnv(name, "false");
    expect(getPcAppRuntime()).toBeUndefined();
  });
  it.each([
    ["PC_APP_RUNTIME", "false"], ["NEXT_PUBLIC_PC_APP_RUNTIME", "false"], ["PC_BACKEND_ENABLED", "false"],
    ["NEXT_PUBLIC_PC_BACKEND", "false"], ["PC_LOCAL_RUNTIME", "false"],
    ["APP_PUBLIC_ORIGIN", "http://pc-app.example.test"], ["APP_PUBLIC_ORIGIN", "https://pc-app.example.test/"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://other-host.example.test/api/pc-supabase"],
    ["NEXT_PUBLIC_PC_APP_SYNTHETIC_REVIEW", "false"], ["SHEET_SYNC_ENABLED", "true"], ["SHEET_SYNC_GAS_URL", "https://gas.example.test"],
  ])("rejects incompatible %s before service startup", (name, value) => {
    vi.stubEnv(name, value); expect(() => getPcAppRuntime()).toThrow();
  });
});
