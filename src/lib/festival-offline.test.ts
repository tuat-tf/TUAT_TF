import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addPendingSale, classifySendError, flushPendingSales, getPendingSales, resetPendingSalesForTest, retryPendingSale,
  type PendingFestivalSale,
} from "./festival-offline";

function sale(id: string): PendingFestivalSale {
  return { id, quantity: 3, amount: 450, soldAt: "2026-11-13T03:00:00.000Z", recordedBy: "user" };
}

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal("navigator", { onLine: true });
  resetPendingSalesForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("classifySendError", () => {
  it("treats a duplicate id as already sent", () => {
    expect(classifySendError(null)).toBe("sent");
    expect(classifySendError({ code: "23505" })).toBe("sent");
  });

  it("gives up on rows the database refuses", () => {
    expect(classifySendError({ code: "42501" })).toBe("rejected");
    expect(classifySendError({ code: "23514" })).toBe("rejected");
  });

  it("retries network failures, timeouts, expired sessions and temporary database trouble", () => {
    expect(classifySendError({ code: "" })).toBe("retry");
    expect(classifySendError({ code: "20" })).toBe("retry");
    expect(classifySendError({ code: "PGRST301" })).toBe("retry");
    expect(classifySendError({ code: "08006" })).toBe("retry");
    expect(classifySendError({ code: "57014" })).toBe("retry");
  });
});

describe("flushPendingSales", () => {
  it("sends in order and keeps the rest when the connection drops", async () => {
    addPendingSale(sale("a"));
    addPendingSale(sale("b"));
    addPendingSale(sale("c"));
    const sent: string[] = [];
    const count = await flushPendingSales(async (item) => {
      if (item.id === "b") return { error: { code: "" } };
      sent.push(item.id);
      return { error: null };
    });
    expect(count).toBe(1);
    expect(sent).toEqual(["a"]);
    expect(getPendingSales().map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("keeps a refused sale aside with a reason and does not resend it until asked", async () => {
    addPendingSale(sale("a"));
    addPendingSale(sale("b"));
    const insert = vi.fn(async (item: PendingFestivalSale) => ({ error: item.id === "a" ? { code: "42501" } : null }));
    expect(await flushPendingSales(insert)).toBe(1);
    expect(getPendingSales()).toEqual([expect.objectContaining({ id: "a", failed: expect.any(String) })]);

    insert.mockClear();
    await flushPendingSales(insert);
    expect(insert).not.toHaveBeenCalled();

    retryPendingSale("a");
    insert.mockImplementation(async () => ({ error: null }));
    expect(await flushPendingSales(insert)).toBe(1);
    expect(getPendingSales()).toEqual([]);
  });

  it("does not try while the device says it is offline", async () => {
    addPendingSale(sale("a"));
    vi.stubGlobal("navigator", { onLine: false });
    const insert = vi.fn(async () => ({ error: null }));
    expect(await flushPendingSales(insert)).toBe(0);
    expect(insert).not.toHaveBeenCalled();
    expect(getPendingSales()).toHaveLength(1);
  });

  it("survives a reload because the queue lives in local storage", async () => {
    addPendingSale(sale("a"));
    resetPendingSalesForTest();
    expect(getPendingSales().map((item) => item.id)).toEqual(["a"]);
  });

  it("runs one flush at a time", async () => {
    addPendingSale(sale("a"));
    let release!: () => void;
    const insert = vi.fn(() => new Promise<{ error: null }>((resolve) => { release = () => resolve({ error: null }); }));
    const first = flushPendingSales(insert);
    const second = flushPendingSales(insert);
    expect(second).toBe(first);
    release();
    expect(await first).toBe(1);
    expect(insert).toHaveBeenCalledTimes(1);
  });
});
