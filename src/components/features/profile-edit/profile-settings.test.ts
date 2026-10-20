import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  cursor: 0, values: [] as unknown[], effects: [] as (() => unknown)[],
  refresh: vi.fn(), error: vi.fn(), clearQueries: vi.fn(), signOut: vi.fn(),
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => {
      state.values[index] = typeof value === "function" ? value(state.values[index]) : value;
    }];
  },
  useRef(initial: unknown) {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = { current: initial };
    return state.values[index];
  },
  useEffect: (effect: () => unknown) => { state.effects.push(effect); },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/lib/client/query-persistence", () => ({ clearPersistedQueries: state.clearQueries }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { signOut: state.signOut } }) }));
import { useProfileAvatar } from "./useProfileAvatar";
import { useProfileSheetSetup } from "./useProfileSheetSetup";
import { useProfileSignOut } from "./useProfileSignOut";

function render<T>(hook: () => T) { state.cursor = 0; return hook(); }
beforeEach(() => {
  state.values = []; state.cursor = 0; state.effects = [];
  state.refresh.mockReset(); state.error.mockReset(); state.clearQueries.mockReset(); state.signOut.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it("refreshes the avatar after response loss and adopts the reconciled server value without rewriting the profile", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("response lost"));
  vi.stubGlobal("fetch", fetcher);
  const avatar = render(() => useProfileAvatar("old-avatar", state.error));
  await expect(avatar.uploadCroppedAvatar(new Blob(["image"], { type: "image/png" }))).rejects.toThrow("保存結果を確認できません");
  expect(state.refresh).toHaveBeenCalledOnce();
  expect(render(() => useProfileAvatar("old-avatar", state.error)).processingAvatar).toBe(false);
  render(() => useProfileAvatar("reconciled-avatar", state.error));
  state.effects.splice(0).forEach(effect => effect());
  expect(render(() => useProfileAvatar("reconciled-avatar", state.error)).avatarUrl).toBe("reconciled-avatar");
  expect(fetcher).toHaveBeenCalledOnce();
});

it("does not load sheet options when record settings are separate", () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(() => useProfileSheetSetup("saved-sheet", true, state.error));
  state.effects.splice(0).forEach(effect => effect());
  expect(fetcher).not.toHaveBeenCalled();
});

it("retains the sheet name and releases the busy guard after a header transport failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await render(() => useProfileSheetSetup("saved-sheet", true, state.error)).openHeaderEditor();
  const current = render(() => useProfileSheetSetup("saved-sheet", true, state.error));
  expect(current.sheetName).toBe("saved-sheet");
  expect(current.loadingHeader).toBe(false);
  expect(state.error).toHaveBeenLastCalledWith(expect.stringContaining("入力は残っています"));
});

it("clears persisted queries and signs out before navigating to login", async () => {
  const order: string[] = [];
  state.clearQueries.mockImplementation(async () => { order.push("clear"); });
  state.signOut.mockImplementation(async () => { order.push("sign-out"); });
  const navigate = vi.fn(() => { order.push("navigate"); });
  vi.stubGlobal("navigator", {});
  vi.stubGlobal("window", { location: { assign: navigate } });
  await render(() => useProfileSignOut("member")).signOut();
  expect(order).toEqual(["clear", "sign-out", "navigate"]);
  expect(navigate).toHaveBeenCalledWith("/login");
});
