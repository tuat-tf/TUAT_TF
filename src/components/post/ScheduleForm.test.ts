import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";
import type { PendingScheduleCreate, ScheduleCreateResult } from "@/lib/schedule-create";
import type { PracticeSchedule, ScheduleType } from "@/types";

type InputProps = {
  type?: string;
  value: string;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  onChange: (event: { target: { value: string } }) => void;
};
type ButtonProps = { children: ReactNode; disabled?: boolean; onClick?: () => void | Promise<void> };
type Draft = { dirty: boolean; busy: boolean; intent?: string; onSave: () => void | Promise<void> };
const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
const mocks = vi.hoisted(() => ({
  save: vi.fn(), claims: vi.fn(), refresh: vi.fn(), done: vi.fn(),
  inputs: new Map<string, InputProps>(), buttons: new Map<string, ButtonProps>(), draft: null as Draft | null,
}));

vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState<State>(initial: State | (() => State)) {
    const slot = hooks.cursor++;
    if (!(slot in hooks.values)) hooks.values[slot] = typeof initial === "function" ? (initial as () => State)() : initial;
    return [hooks.values[slot], (value: State | ((before: State) => State)) => {
      hooks.values[slot] = typeof value === "function" ? (value as (before: State) => State)(hooks.values[slot] as State) : value;
    }];
  },
  useRef<Value>(initial: Value) {
    const slot = hooks.cursor++;
    if (!(slot in hooks.values)) hooks.values[slot] = { current: initial };
    return hooks.values[slot];
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { getClaims: mocks.claims } }) }));
vi.mock("@/lib/schedule-create", async original => ({ ...await original<typeof import("@/lib/schedule-create")>(), saveNewSchedule: mocks.save }));
vi.mock("@/components/ui/form-modal", () => ({
  FormModal: ({ children }: { children: ReactNode }) => createElement("div", {}, children),
  FormModalFooter: ({ children }: { children: ReactNode }) => createElement("footer", {}, children),
  useFormDraft: (draft: Draft) => { mocks.draft = draft; },
}));
vi.mock("@/components/ui/input", () => ({ Input: (props: InputProps) => {
  mocks.inputs.set(props["aria-label"] ?? props.placeholder ?? props.type ?? "text", props);
  return createElement("input", { type: props.type, "aria-label": props["aria-label"], value: props.value, onChange: props.onChange, disabled: props.disabled });
} }));
vi.mock("@/components/ui/textarea", () => ({ Textarea: (props: InputProps) => {
  mocks.inputs.set("詳細情報", props);
  return createElement("textarea", { value: props.value, onChange: props.onChange, disabled: props.disabled });
} }));
// The shared time/place fields have their own selects; here they are plain inputs so the save flow stays in focus.
vi.mock("@/components/post/ScheduleFields", async original => ({
  ...await original<typeof import("@/components/post/ScheduleFields")>(),
  MeetingTimeField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
    mocks.inputs.set("集合時間", { value, onChange: (event: { target: { value: string } }) => onChange(event.target.value) });
    return createElement("input", { type: "time", "aria-label": "集合時間", value, readOnly: true });
  },
  VenueField: () => null,
}));
vi.mock("@/components/ui/button", () => ({ Button: (props: ButtonProps) => {
  if (typeof props.children === "string") mocks.buttons.set(props.children, props);
  return createElement("button", { onClick: props.onClick, disabled: props.disabled }, props.children);
} }));

import { ScheduleForm } from "./ScheduleForm";

function renderCreateForm() {
  hooks.cursor = 0;
  mocks.inputs.clear();
  mocks.buttons.clear();
  return renderToStaticMarkup(createElement(ScheduleForm, { initialType: "meet", onDone: mocks.done }));
}

function enterSchedule() {
  renderCreateForm();
  mocks.inputs.get("date")!.onChange({ target: { value: "2026-10-20" } });
  mocks.inputs.get("例: 県選手権 / 合宿")!.onChange({ target: { value: "合成記録会" } });
  mocks.inputs.get("集合時間")!.onChange({ target: { value: "08:35" } });
  mocks.inputs.get("詳細情報")!.onChange({ target: { value: "集合場所を確認" } });
  return renderCreateForm();
}

async function click(label: string) {
  await mocks.buttons.get(label)!.onClick!();
}

beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
  mocks.inputs.clear();
  mocks.buttons.clear();
  mocks.draft = null;
  vi.clearAllMocks();
  mocks.save.mockReset();
  mocks.done.mockReset();
  mocks.refresh.mockReset();
  mocks.claims.mockReset().mockResolvedValue({ data: { claims: { sub: "member" } }, error: null });
});

describe("予定の集合時間入力", () => {
  it.each<ScheduleType>(["practice", "meet", "time_trial"])("新規の%sでも同じ集合時間の欄を出す", (type) => {
    const html = renderToStaticMarkup(createElement(ScheduleForm, { initialType: type, onDone: () => {} }));
    expect(html).toMatch(/type="time"[^>]*aria-label="集合時間"[^>]*value=""/);
  });

  it.each<ScheduleType>(["meet", "time_trial"])("%sの保存済み集合時間を再編集できる", (type) => {
    const schedule = { id: "existing", schedule_type: type, meeting_time: "07:35:00", schedule_date: "2026-10-25", title: "大会" } as PracticeSchedule;
    const html = renderToStaticMarkup(createElement(ScheduleForm, { schedule, onDone: () => {} }));
    expect(html).toMatch(/type="time"[^>]*aria-label="集合時間"[^>]*value="07:35"/);
    expect(html).toContain("更新する");
  });
});

describe("予定作成の保存結果確認", () => {
  it("keeps entered values locked and confirms the same operation after an unknown save", async () => {
    mocks.save.mockImplementation(async (_client: unknown, pending: PendingScheduleCreate) => {
      pending.uncertain = true;
      return { ok: false, reason: "unknown" };
    });
    enterSchedule();
    await click("作成する");
    const pending = mocks.save.mock.calls[0][1] as PendingScheduleCreate;
    const html = renderCreateForm();
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(mocks.buttons.has("保存結果を確認する")).toBe(true);
    expect(mocks.draft).toMatchObject({ dirty: true, busy: false, intent: "check" });
    expect(mocks.inputs.get("date")!.value).toBe("2026-10-20");
    expect(mocks.inputs.get("例: 県選手権 / 合宿")!.value).toBe("合成記録会");
    expect(mocks.inputs.get("集合時間")!.value).toBe("08:35");
    expect(mocks.inputs.get("詳細情報")!.value).toBe("集合場所を確認");
    expect(pending.row).toMatchObject({
      created_by: "member", schedule_date: "2026-10-20", title: "合成記録会",
      meeting_time: "08:35", note: "集合場所を確認",
    });
    await mocks.draft!.onSave();
    renderCreateForm();
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1][1]).toBe(pending);
    expect(mocks.inputs.get("date")!.value).toBe("2026-10-20");
    expect(mocks.claims).toHaveBeenCalledOnce();
    expect(mocks.done).not.toHaveBeenCalled();
  });

  it("dispatches once when the same rendered create handler is invoked twice", async () => {
    let resolveSave: (result: ScheduleCreateResult) => void = () => {};
    mocks.save.mockImplementation(() => new Promise<ScheduleCreateResult>((resolve) => { resolveSave = resolve; }));
    enterSchedule();
    const create = mocks.buttons.get("作成する")!.onClick!;
    const first = create();
    const second = create();
    await Promise.resolve();
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.claims).toHaveBeenCalledOnce();
    const html = renderCreateForm();
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(mocks.draft!.busy).toBe(true);
    const pending = mocks.save.mock.calls[0][1] as PendingScheduleCreate;
    pending.uncertain = true;
    resolveSave({ ok: false, reason: "unknown" });
    await Promise.all([first, second]);
    renderCreateForm();
    expect(mocks.buttons.get("保存結果を確認する")!.disabled).toBe(false);
    expect(mocks.save).toHaveBeenCalledOnce();
  });

  it("never invokes the helper again after a confirmed save when the completion callback throws", async () => {
    mocks.save.mockResolvedValue({ ok: true });
    mocks.done.mockImplementationOnce(() => { throw new Error("Completion failed after commit"); });
    enterSchedule();
    await click("作成する");
    const html = renderCreateForm();
    expect(html).toContain("保存結果を確認する");
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(mocks.draft).toMatchObject({ dirty: true, busy: false, intent: "check" });
    await click("保存結果を確認する");
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.done).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("allows correcting preserved input after a definitive refusal", async () => {
    mocks.save.mockResolvedValue({ ok: false, reason: "forbidden" });
    enterSchedule();
    await click("作成する");
    const html = renderCreateForm();
    expect(html).not.toMatch(/<fieldset[^>]*disabled/);
    expect(mocks.buttons.get("作成する")!.disabled).toBe(false);
    expect(mocks.draft).toMatchObject({ busy: false, intent: "save" });
    expect(mocks.inputs.get("date")!.value).toBe("2026-10-20");
    mocks.inputs.get("date")!.onChange({ target: { value: "2026-10-22" } });
    mocks.inputs.get("詳細情報")!.onChange({ target: { value: "修正した連絡" } });
    renderCreateForm();
    expect(mocks.inputs.get("date")!.value).toBe("2026-10-22");
    expect(mocks.inputs.get("詳細情報")!.value).toBe("修正した連絡");
    expect(mocks.done).not.toHaveBeenCalled();
  });

  it("finishes only after a later confirmation succeeds for the original operation", async () => {
    mocks.save.mockImplementationOnce(async (_client: unknown, pending: PendingScheduleCreate) => {
      pending.uncertain = true;
      return { ok: false, reason: "unknown" };
    }).mockImplementationOnce(async (_client: unknown, pending: PendingScheduleCreate) => {
      pending.uncertain = false;
      return { ok: true };
    });
    enterSchedule();
    await click("作成する");
    const original = mocks.save.mock.calls[0][1];
    renderCreateForm();
    expect(mocks.done).not.toHaveBeenCalled();
    await click("保存結果を確認する");
    expect(mocks.save.mock.calls[1][1]).toBe(original);
    expect(mocks.done).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
