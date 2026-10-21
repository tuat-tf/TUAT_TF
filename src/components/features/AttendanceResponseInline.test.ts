import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AttendanceChange, AttendancePending } from "@/lib/attendance-save";

type ButtonProps = { children: ReactNode; disabled?: boolean; onClick: () => void; "aria-label"?: string; "aria-expanded"?: boolean; "aria-busy"?: boolean };
type InputProps = { value: string; onChange: (event: { target: { value: string } }) => void; onBlur: () => void; onCompositionStart: () => void; onCompositionEnd: (event: { currentTarget: { value: string } }) => void };
const state = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, cleanup: null as (() => void) | null }));
const capture = vi.hoisted(() => ({ buttons: new Map<string, ButtonProps>(), input: null as InputProps | null, save: vi.fn(), changed: vi.fn() }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) { const i = state.cursor++; if (!(i in state.values)) state.values[i] = initial; return [state.values[i], (next: unknown) => { state.values[i] = typeof next === "function" ? next(state.values[i]) : next; }]; },
  useRef(initial: unknown) { const i = state.cursor++; if (!(i in state.values)) state.values[i] = { current: initial }; return state.values[i]; },
  useEffect(effect: () => () => void) { if (!state.cleanup) state.cleanup = effect(); },
}));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/attendance-save", async original => ({ ...await original<typeof import("@/lib/attendance-save")>(), saveAttendance: capture.save }));
vi.mock("@/components/ui/button", () => ({ Button: (props: ButtonProps) => {
  const name = props["aria-label"] ?? (typeof props.children === "string" ? props.children : "");
  if (name) capture.buttons.set(name, props);
  return createElement("button", { disabled: props.disabled, "aria-busy": props["aria-busy"], "aria-expanded": props["aria-expanded"] }, props.children);
} }));
vi.mock("@/components/ui/input", () => ({ Input: (props: InputProps) => { capture.input = props; return createElement("input", { value: props.value, readOnly: true }); } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));
import { AttendanceToggle } from "./AttendanceResponse";

const initial: AttendanceChange = { status: "present", isLate: false, lateNote: "保存済みの連絡", absenceNote: null };
function render(value = initial) {
  state.cursor = 0; capture.buttons.clear(); capture.input = null;
  const tree = AttendanceToggle({ scheduleId: "schedule", attendDate: "2099-11-15", userId: "me", initial: value.status, initialLate: value.isLate, initialLateNote: value.lateNote, initialAbsenceNote: value.absenceNote, onChanged: capture.changed, summary: createElement("button", null, "人数") });
  function captureNativeButtons(node: ReactNode) {
    if (Array.isArray(node)) { node.forEach(captureNativeButtons); return; }
    if (!isValidElement<ButtonProps>(node)) return;
    if (node.type === "button" && node.props["aria-label"]) capture.buttons.set(node.props["aria-label"], node.props);
    captureNativeButtons(node.props.children);
  }
  captureNativeButtons(tree);
  return renderToStaticMarkup(tree);
}
async function click(name: string) { capture.buttons.get(name)!.onClick(); await Promise.resolve(); }
function type(text: string) { capture.input!.onChange({ target: { value: text } }); }
async function open(value = initial) { render(value); await click("連絡を編集"); render(value); }
beforeEach(() => {
  state.values = []; state.cursor = 0; state.cleanup = null; vi.clearAllMocks(); vi.useFakeTimers();
  capture.save.mockImplementation(async (_client: unknown, _key: unknown, pending: AttendancePending) => ({ ok: true, value: pending.after }));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it("keeps contact collapsed through attendance changes and opens lateness only explicitly", async () => {
  const empty: AttendanceChange = { status: "none", isLate: false, lateNote: null, absenceNote: null };
  render(empty);
  expect(capture.buttons.get("連絡する")?.disabled).toBe(true);
  for (const label of ["出欠を入力", "出席", "欠席", "出欠を入力"]) {
    await click(label); render(empty);
    expect(capture.input).toBeNull();
    expect(capture.buttons.has("遅刻を連絡")).toBe(false);
    expect(capture.buttons.get("連絡する")?.["aria-expanded"]).toBe(false);
  }
  await click("連絡する"); render(empty);
  expect(capture.buttons.has("遅刻を連絡")).toBe(true);
  expect(capture.input).not.toBeNull();
  expect(capture.save).toHaveBeenCalledTimes(4);
});

it("switches attendance immediately and accepts the next choice while the first save is pending", async () => {
  const empty: AttendanceChange = { status: "none", isLate: false, lateNote: null, absenceNote: null };
  let finish!: (result: { ok: true; value: AttendanceChange }) => void;
  capture.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(empty); await click("出欠を入力"); const first = capture.save.mock.lastCall![2]; render(empty);
  expect(capture.buttons.get("出席")?.disabled).toBe(false);
  expect(capture.changed).toHaveBeenLastCalledWith(expect.objectContaining({ status: "present" }));
  await click("出席"); render(empty);
  expect(capture.buttons.get("欠席")?.disabled).toBe(false);
  expect(capture.save).toHaveBeenCalledOnce();
  finish({ ok: true, value: first.after }); await vi.advanceTimersByTimeAsync(0); render(empty);
  expect(capture.save).toHaveBeenCalledTimes(2);
  expect(capture.save.mock.lastCall![2]).toMatchObject({ before: { status: "present" }, after: { status: "absent" } });
  expect(capture.changed).toHaveBeenLastCalledWith(expect.objectContaining({ status: "absent" }));
});

it("coalesces rapid choices back to the in-flight value without another write", async () => {
  const empty: AttendanceChange = { status: "none", isLate: false, lateNote: null, absenceNote: null };
  let finish!: (result: { ok: true; value: AttendanceChange }) => void;
  capture.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  render(empty); await click("出欠を入力"); const first = capture.save.mock.lastCall![2];
  for (const label of ["出席", "欠席", "出欠を入力"]) { render(empty); await click(label); }
  finish({ ok: true, value: first.after }); await vi.advanceTimersByTimeAsync(1000);
  expect(capture.save).toHaveBeenCalledOnce(); expect(render(empty)).toContain('aria-label="出席"');
});

it.each(["failed", "conflict", "unknown"])("rolls back the count and stops queued choices after %s", async reason => {
  const empty: AttendanceChange = { status: "none", isLate: false, lateNote: null, absenceNote: null };
  let finish!: (result: { ok: false; reason: string }) => void;
  capture.save.mockImplementationOnce((_client: unknown, _key: unknown, pending: AttendancePending) => {
    pending.uncertain = reason === "unknown";
    return new Promise(resolve => { finish = resolve; });
  });
  render(empty); await click("出欠を入力"); const first = capture.save.mock.lastCall![2];
  render(empty); await click("出席"); finish({ ok: false, reason }); await vi.advanceTimersByTimeAsync(1000);
  const html = render(empty); expect(html).toContain('role="alert"');
  expect(capture.changed).toHaveBeenLastCalledWith(empty); expect(capture.save).toHaveBeenCalledOnce();
  if (reason === "unknown") {
    expect(capture.buttons.get("出欠を入力")?.disabled).toBe(true);
    await click("保存結果を確認"); expect(capture.save.mock.lastCall![2]).toBe(first);
    expect(capture.save).toHaveBeenCalledTimes(2);
  }
});

it("keeps the latest contact when attendance changes during contact saving", async () => {
  await open(); let finish!: (result: { ok: true; value: AttendanceChange }) => void;
  capture.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  type("先の連絡"); await vi.advanceTimersByTimeAsync(700); const first = capture.save.mock.lastCall![2];
  render(); type("新しい連絡"); await click("出席"); render();
  expect(capture.buttons.get("欠席")?.disabled).toBe(false);
  finish({ ok: true, value: first.after }); await vi.advanceTimersByTimeAsync(1000);
  expect(capture.save).toHaveBeenCalledTimes(2);
  expect(capture.save.mock.lastCall![2]).toMatchObject({ before: first.after, after: { status: "absent", absenceNote: "新しい連絡", lateNote: null } });
  expect(capture.changed).toHaveBeenLastCalledWith(expect.objectContaining({ status: "absent", absenceNote: "新しい連絡" }));
});

it.each(["present", "absent"] as const)("automatically saves %s contact once typing settles without a save button", async status => {
  const value = { ...initial, status, lateNote: status === "present" ? initial.lateNote : null, absenceNote: status === "absent" ? initial.lateNote : null };
  await open(value); type("途中"); await vi.advanceTimersByTimeAsync(400); type("変更した連絡");
  await vi.advanceTimersByTimeAsync(699); expect(capture.save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); const html = render(value);
  expect(capture.save).toHaveBeenCalledOnce(); expect(capture.input!.value).toBe("変更した連絡");
  expect(html).toContain("保存しました"); expect(capture.buttons.has("保存する")).toBe(false);
  expect(capture.changed).toHaveBeenCalledWith(expect.objectContaining(status === "present" ? { lateNote: "変更した連絡" } : { absenceNote: "変更した連絡" }));
});
it("flushes on blur and does not send an unchanged value or the trailing timer again", async () => {
  await open(); capture.input!.onBlur(); await vi.advanceTimersByTimeAsync(1000); expect(capture.save).not.toHaveBeenCalled();
  type("早退します"); capture.input!.onBlur(); await vi.advanceTimersByTimeAsync(1000); render(); expect(capture.save).toHaveBeenCalledOnce();
  type(" 早退します "); await vi.advanceTimersByTimeAsync(1000); expect(capture.save).toHaveBeenCalledOnce();
});
it("does not submit an intermediate Japanese composition", async () => {
  await open(); capture.input!.onCompositionStart(); type("へんかんちゅう"); await vi.advanceTimersByTimeAsync(2000); expect(capture.save).not.toHaveBeenCalled();
  capture.input!.onCompositionEnd({ currentTarget: { value: "変換完了" } }); await vi.advanceTimersByTimeAsync(700);
  expect(capture.save.mock.lastCall![2].after.lateNote).toBe("変換完了");
});
it("keeps typing enabled during saving and serializes the latest draft using the confirmed value", async () => {
  await open(); let finish!: (result: { ok: true; value: AttendanceChange }) => void;
  capture.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  type("先の連絡"); await vi.advanceTimersByTimeAsync(700); const first = capture.save.mock.lastCall![2];
  expect(render()).not.toContain('fieldset disabled=""'); type("最新の連絡"); await vi.advanceTimersByTimeAsync(700);
  expect(capture.save).toHaveBeenCalledOnce(); finish({ ok: true, value: first.after }); await vi.advanceTimersByTimeAsync(0);
  expect(capture.save).toHaveBeenCalledTimes(2); expect(capture.save.mock.lastCall![2].before).toEqual(first.after);
  expect(capture.save.mock.lastCall![2].after.lateNote).toBe("最新の連絡"); expect(render()).toContain("保存しました"); expect(capture.input!.value).toBe("最新の連絡");
});
it("shows a spinner only on lateness and saves a concurrent contact against its confirmed state", async () => {
  await open(); let finish!: (result: { ok: true; value: AttendanceChange }) => void;
  capture.save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await click("遅刻を連絡"); const pending = capture.save.mock.lastCall![2]; let html = render();
  expect(html).toMatch(/aria-label="出席" aria-busy="false"/); expect(capture.buttons.get("遅刻を連絡")!["aria-busy"]).toBe(true);
  expect(html.match(/animate-spin/g)).toHaveLength(1); type("10分遅れます"); await vi.advanceTimersByTimeAsync(700);
  expect(capture.save).toHaveBeenCalledOnce(); finish({ ok: true, value: pending.after }); await vi.advanceTimersByTimeAsync(0); html = render();
  expect(capture.save.mock.lastCall![2].after).toMatchObject({ isLate: true, lateNote: "10分遅れます" });
  expect(html).not.toContain("遅刻連絡済み"); expect(capture.buttons.has("遅刻を取り消す")).toBe(true);
});
it("stops automatic retries for an uncertain save and checks the same pending request", async () => {
  await open(); capture.save.mockImplementationOnce(async (_client: unknown, _key: unknown, pending: AttendancePending) => { pending.uncertain = true; return { ok: false, reason: "unknown" }; });
  type("送信した連絡"); await vi.advanceTimersByTimeAsync(700); const pending = capture.save.mock.lastCall![2];
  expect(render()).toContain('fieldset disabled=""'); await vi.advanceTimersByTimeAsync(5000); expect(capture.save).toHaveBeenCalledOnce();
  await click("保存結果を確認"); expect(capture.save.mock.lastCall![2]).toBe(pending); expect(render()).toContain("保存しました");
});
it.each(["failed", "conflict"])("retains contact after %s and waits for explicit retry", async reason => {
  await open(); capture.save.mockResolvedValueOnce({ ok: false, reason }); type("残す連絡"); await vi.advanceTimersByTimeAsync(700);
  expect(render()).toContain('role="alert"'); expect(capture.input!.value).toBe("残す連絡");
  type("残す連絡の続き"); capture.input!.onBlur(); await vi.advanceTimersByTimeAsync(5000); expect(capture.save).toHaveBeenCalledOnce();
  await click("もう一度保存する"); expect(capture.save).toHaveBeenCalledTimes(2); expect(render()).toContain("保存しました");
});
it("flushes a pending draft when leaving the card and does not send twice", async () => {
  await open(); type("移動前の連絡"); state.cleanup!(); await vi.advanceTimersByTimeAsync(1000);
  expect(capture.save).toHaveBeenCalledOnce(); expect(capture.save.mock.lastCall![2].after.lateNote).toBe("移動前の連絡");
});
it("clears saved contact by automatically saving an empty field", async () => {
  await open(); type(""); await vi.advanceTimersByTimeAsync(700); render();
  expect(capture.save.mock.lastCall![2].after.lateNote).toBeNull(); expect(capture.buttons.has("連絡する")).toBe(true);
});
