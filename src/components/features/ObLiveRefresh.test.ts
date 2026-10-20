import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const state = vi.hoisted(() => ({ effect: null as (() => void) | null, refresh: vi.fn(), dialogOpen: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => void) => { state.effect = effect; },
  useSyncExternalStore: () => true,
  useTransition: () => [false, (run: () => void) => run()],
}));
import { isMeetLive, ObLiveRefresh } from "./ObLiveRefresh";

beforeEach(() => {
  vi.useFakeTimers();
  state.refresh.mockReset();
  state.dialogOpen = false;
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn(), querySelector: () => state.dialogOpen ? {} : null });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("includes the complete multi-day meet and uses JST at the date boundaries", () => {
  vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
  expect(isMeetLive("2026-10-20", "2026-10-21")).toBe(true);
  vi.setSystemTime(new Date("2026-10-21T14:59:59Z"));
  expect(isMeetLive("2026-10-20", "2026-10-21")).toBe(true);
  vi.setSystemTime(new Date("2026-10-21T15:00:00Z"));
  expect(isMeetLive("2026-10-20", "2026-10-21")).toBe(false);
  expect(isMeetLive("", null)).toBe(false);
});

it("makes no automatic requests before the meet and begins 30-second refresh on the meet date", () => {
  vi.setSystemTime(new Date("2026-10-19T14:59:00Z"));
  ObLiveRefresh({ startsOn: "2026-10-20", endsOn: null });
  state.effect!();
  vi.advanceTimersByTime(59_999);
  expect(state.refresh).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(state.refresh).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(30_000);
  expect(state.refresh).toHaveBeenCalledTimes(2);
});

it("preserves an open editor during the meet and leaves manual refresh available afterward", () => {
  vi.setSystemTime(new Date("2026-10-20T01:00:00Z"));
  const tree = ObLiveRefresh({ startsOn: "2026-10-20" });
  state.effect!();
  state.dialogOpen = true;
  vi.advanceTimersByTime(30_000);
  expect(state.refresh).not.toHaveBeenCalled();
  state.dialogOpen = false;
  vi.advanceTimersByTime(30_000);
  expect(state.refresh).toHaveBeenCalledOnce();
  vi.setSystemTime(new Date("2026-10-22T01:00:00Z"));
  vi.advanceTimersByTime(60_000);
  expect(state.refresh).toHaveBeenCalledOnce();
  const button = (tree.props.children as ReactElement[]).find(child => child?.type === "button")!;
  (button.props as { onClick: () => void }).onClick();
  expect(state.refresh).toHaveBeenCalledTimes(2);
});
