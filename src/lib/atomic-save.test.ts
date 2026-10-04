import { describe, expect, it, vi } from "vitest";
import { atomicSave } from "./atomic-save";

describe("atomic saves", () => {
  it("returns a committed response without a second request", async () => {
    const confirm = vi.fn();
    expect(await atomicSave({ uncertain: false }, async () => ({ data: "saved", error: null }), confirm)).toEqual({ ok: true, value: "saved" });
    expect(confirm).not.toHaveBeenCalled();
  });
  it("retains an unknown request and only reads when the user tries again", async () => {
    const state = { uncertain: false };
    const write = vi.fn().mockRejectedValue(new Error("response lost"));
    const confirm = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("saved");
    expect(await atomicSave(state, write, confirm)).toEqual({ ok: false, reason: "unknown" });
    expect(await atomicSave(state, write, confirm)).toEqual({ ok: true, value: "saved" });
    expect(write).toHaveBeenCalledTimes(1);
    expect(state.uncertain).toBe(false);
  });
  it("never turns a different or unreadable saved snapshot into success", async () => {
    const state = { uncertain: false };
    const write = vi.fn().mockResolvedValue({ data: null, error: { code: "" } });
    expect(await atomicSave(state, write, async () => null)).toEqual({ ok: false, reason: "unknown" });
    expect(await atomicSave(state, write, async () => { throw Error("offline"); })).toEqual({ ok: false, reason: "unknown" });
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("reports transactional conflicts and RLS refusals without replay", async () => {
    for (const [code, reason] of [["40001", "conflict"], ["42501", "forbidden"], ["23503", "failed"]]) {
      const confirm = vi.fn();
      const state = { uncertain: false };
      expect(await atomicSave(state, async () => ({ data: null, error: { code } }), confirm)).toEqual({ ok: false, reason });
      expect(confirm).not.toHaveBeenCalled();
      expect(state.uncertain).toBe(false);
    }
  });
});
