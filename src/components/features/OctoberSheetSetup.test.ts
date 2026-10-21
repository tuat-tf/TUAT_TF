import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Profile, RecordFieldDef } from "@/types";

const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
const calls = vi.hoisted(() => ({ fetch: vi.fn(), replace: vi.fn(), refresh: vi.fn(), next: null as null | (() => void), confirm: null as null | ((fields: RecordFieldDef[]) => Promise<boolean>), cancel: null as null | (() => void) }));
vi.mock("react", async original => ({ ...await original<typeof import("react")>(),
  useState(initial: unknown) { const i = state.cursor++; if (!(i in state.values)) state.values[i] = typeof initial === "function" ? initial() : initial; return [state.values[i], (value: unknown) => { state.values[i] = typeof value === "function" ? value(state.values[i]) : value; }]; },
  useEffect() {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: calls.replace, refresh: calls.refresh }), usePathname: () => "/mypage/settings/records" }));
vi.mock("@/components/ui/form-modal", () => ({ FormModal: ({ children }: { children: ReactNode }) => React.createElement("div", null, children) }));
vi.mock("@/components/ui/button", () => ({ Button: ({ onClick, children }: { onClick: () => void; children: ReactNode }) => { calls.next = onClick; return React.createElement("button", null, children); } }));
vi.mock("./SheetInputModeSetting", () => ({ SheetInputModeSetting: () => null }));
vi.mock("./SheetHeaderSetupDialog", () => ({ SheetHeaderSetupDialog: () => null }));
vi.mock("./RecordFieldsSetting", () => ({ RecordFieldsSetting: ({ onConfirm, onCancel }: { onConfirm: typeof calls.confirm; onCancel: typeof calls.cancel }) => { calls.confirm = onConfirm; calls.cancel = onCancel; return React.createElement("div", null, "入力項目の編集"); } }));
import { OctoberSheetSetup } from "./OctoberSheetSetup";

const profile = { id: "member", blocks: ["middle_long"], sheet_transition: { mode: "off" }, record_fields: [], sheet_name: null } as unknown as Profile;
function render() { state.cursor = 0; return renderToStaticMarkup(OctoberSheetSetup({ profile })); }
beforeEach(() => { state.values = []; state.cursor = 0; vi.stubGlobal("React", React); vi.stubGlobal("fetch", calls.fetch); });
afterEach(() => { vi.unstubAllGlobals(); });

it("edits fields through the same setup entry and saves method and fields together", async () => {
  expect(render()).toContain("入力・表示項目を確認");
  calls.next!();
  expect(render()).toContain("入力項目の編集");
  expect(calls.fetch).not.toHaveBeenCalled();
  const fields: RecordFieldDef[] = [{ key: "reflection", label: "振り返り", type: "text" }];
  calls.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
  expect(await calls.confirm!(fields)).toBe(true);
  expect(calls.fetch).toHaveBeenCalledOnce();
  const [, options] = calls.fetch.mock.calls[0];
  expect(JSON.parse(options.body)).toMatchObject({ mode: "off", fields });
  expect(calls.replace).toHaveBeenCalledWith("/mypage/settings");
  expect(render()).toBe("");
});

it("keeps the editor open after an unsuccessful save and does not retry automatically", async () => {
  render(); calls.next!(); render();
  calls.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: "保存できません" }) });
  expect(await calls.confirm!([])).toBe(false);
  expect(render()).toContain("入力項目の編集");
  expect(calls.replace).not.toHaveBeenCalled();
  expect(calls.fetch).toHaveBeenCalledOnce();
});

it("returns to input-method selection without saving when cancelled", () => {
  render(); calls.next!(); render(); calls.cancel!();
  expect(render()).toContain("入力・表示項目を確認");
  expect(calls.fetch).not.toHaveBeenCalled();
});
