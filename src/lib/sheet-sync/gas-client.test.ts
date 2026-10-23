import { beforeEach, describe, expect, it, vi } from "vitest";

const respond = vi.hoisted(() => ({ status: 200, body: {} as unknown }));
vi.mock("./gas-http", () => ({
  fetchGasResponse: async () => new Response(JSON.stringify(respond.body), { status: respond.status }),
}));
vi.mock("@/lib/pc-backup-status", () => ({ assertPcAppWriteAllowed: async () => undefined }));
import { gasPost } from "./gas-client";

describe("gasPost write outcome", () => {
  beforeEach(() => {
    vi.stubEnv("SHEET_SYNC_GAS_URL", "https://gas.example.test/synthetic/exec");
    respond.status = 200;
  });

  it("treats an explicit written:false as not sent", async () => {
    respond.body = { error: "Error: 別の保存処理中です", written: false };
    await expect(gasPost({ action: "writeCells" })).rejects.toMatchObject({ code: "SHEET_WRITE_NOT_SENT", resultUnknown: false });
  });

  it("keeps any other GAS error an unknown result", async () => {
    respond.body = { error: "Error: flush failed" };
    await expect(gasPost({ action: "writeCells" })).rejects.toMatchObject({ code: "SHEET_WRITE_RESULT_UNKNOWN", resultUnknown: true });
  });

  it("never trusts written:false on a failed HTTP response", async () => {
    respond.status = 500;
    respond.body = { error: "Error: busy", written: false };
    await expect(gasPost({ action: "writeCells" })).rejects.toMatchObject({ code: "SHEET_WRITE_RESULT_UNKNOWN" });
  });
});
