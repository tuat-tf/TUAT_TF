import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseTrainingSelection, readTrainingSelection, subscribeTrainingSelection, trainingSelectionKey, writeTrainingSelection } from "./training-review-selection";

let storage: Map<string, string>;
let browser: EventTarget & { localStorage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> } };
beforeEach(() => {
  storage = new Map();
  browser = Object.assign(new EventTarget(), { localStorage: {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
  } });
  vi.stubGlobal("window", browser);
});
afterEach(() => vi.unstubAllGlobals());

describe("saved training display selection", () => {
  it("restores checked fields after reopening and keeps an empty selection", async () => {
    const key = trainingSelectionKey("reopen");
    writeTrainingSelection(key, ["menu_text", "memo"]);
    vi.resetModules();
    const reopened = await import("./training-review-selection");
    expect(reopened.parseTrainingSelection(reopened.readTrainingSelection(key))).toEqual(["menu_text", "memo"]);
    reopened.writeTrainingSelection(key, []);
    expect(parseTrainingSelection(readTrainingSelection(key))).toEqual([]);
  });
  it("does not reuse another account's choices", () => {
    writeTrainingSelection(trainingSelectionKey("first-user"), ["memo"]);
    expect(readTrainingSelection(trainingSelectionKey("second-user"))).toBeNull();
  });
  it.each(["not-json", "{}", '["memo",3]', "null"])("falls back to defaults for invalid settings: %s", raw => {
    expect(parseTrainingSelection(raw)).toBeNull();
  });
  it("notifies only the affected account and unsubscribes on leaving", () => {
    const changed = vi.fn();
    const stop = subscribeTrainingSelection(trainingSelectionKey("listener"), changed);
    writeTrainingSelection(trainingSelectionKey("another"), ["menu_text"]);
    expect(changed).not.toHaveBeenCalled();
    writeTrainingSelection(trainingSelectionKey("listener"), ["memo"]);
    expect(changed).toHaveBeenCalledOnce();
    stop(); writeTrainingSelection(trainingSelectionKey("listener"), []);
    expect(changed).toHaveBeenCalledOnce();
  });
  it("keeps this page usable when storage is blocked", () => {
    browser.localStorage.setItem.mockImplementation(() => { throw new Error("blocked"); });
    writeTrainingSelection(trainingSelectionKey("blocked"), ["memo"]);
    expect(parseTrainingSelection(readTrainingSelection(trainingSelectionKey("blocked")))).toEqual(["memo"]);
  });
});
