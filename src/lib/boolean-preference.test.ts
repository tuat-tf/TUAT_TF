import { afterEach, describe, expect, it, vi } from "vitest";
import { readBooleanPreference } from "./boolean-preference";

afterEach(() => vi.unstubAllGlobals());

describe("browser display preference recovery", () => {
  it("uses the newly saved cookie when a denied write leaves stale Storage", () => {
    vi.stubGlobal("document", { cookie: "another=0; training-review-reflections-viewer=1" });
    vi.stubGlobal("window", { localStorage: { getItem: () => "0" } });
    expect(readBooleanPreference("training-review-reflections-viewer")).toBe(true);
  });

  it("reads the viewer's cookie when Storage is unavailable", () => {
    vi.stubGlobal("document", { cookie: "training-review-reflections-other=1; training-review-reflections-viewer=0" });
    vi.stubGlobal("window", { localStorage: { getItem() { throw new Error("Storage unavailable"); } } });
    expect(readBooleanPreference("training-review-reflections-viewer")).toBe(false);
    expect(readBooleanPreference("training-review-reflections-new-viewer")).toBeNull();
  });

  it("keeps an existing Storage setting if the cookie has not been saved", () => {
    vi.stubGlobal("document", { cookie: "another=1" });
    vi.stubGlobal("window", { localStorage: { getItem: () => "1" } });
    expect(readBooleanPreference("timeline-compact")).toBe(true);
  });

  it("returns no override when neither browser storage mechanism is available", () => {
    vi.stubGlobal("document", { get cookie() { throw new Error("Cookies unavailable"); } });
    vi.stubGlobal("window", { localStorage: { getItem() { throw new Error("Storage unavailable"); } } });
    expect(readBooleanPreference("timeline-compact")).toBeNull();
  });
});
