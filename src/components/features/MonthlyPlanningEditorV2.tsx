"use client";

import { MENU_DRAFT_VISIBILITY_DESCRIPTION } from "@/lib/menu-copy";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, LoaderCircle, Save } from "lucide-react";
import { PersonPicker } from "@/components/features/PersonPicker";
import { MeetingTimeField, VenueField, venueDetails } from "@/components/post/ScheduleFields";
import { Button } from "@/components/ui/button";
import { FormModalFooter, useFormDraft } from "@/components/ui/form-modal";
import { SegmentedControl } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { BLOCKS, EDITABLE_BLOCK_ORDER } from "@/lib/constants";
import type { AuthorMini, Block, PracticeMenu, PracticeSchedule, VenueRow } from "@/types";

type ScheduleDraft = {
  id?: string;
  time: string;
  venue: string;
  note: string;
  /** この予定を出す対象。取り違えたときはここで全体・中長距離・短距離を付け替える */
  scope?: ScheduleScope;
};
type MenuDraft = { id?: string; content: string; pace: string; remark: string; supplement: string };
type RowState = "dirty" | "saving" | "saved" | "error";
type ScheduleScope = "all" | "middle_long" | "short";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function readStored<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}

function hasScheduleValue(draft?: ScheduleDraft) { return !!draft && !!(draft.time || draft.venue || draft.note); }
/** 保存対象かどうか。既に保存済みの予定は、対象ブロックだけ変えた場合も保存する。 */
function isScheduleSavable(draft?: ScheduleDraft) { return hasScheduleValue(draft) || !!draft?.id; }
/** DBの target_blocks と、画面の「全体・中長距離・短距離」の相互変換 */
function scopeOf(targetBlocks: Block[]): ScheduleScope {
  if (targetBlocks.length === 1 && (targetBlocks[0] === "middle_long" || targetBlocks[0] === "short")) return targetBlocks[0];
  return "all";
}
function blocksOf(scope: ScheduleScope): Block[] { return scope === "all" ? [] : [scope]; }
function hasMenuValue(draft?: MenuDraft) { return !!draft && [draft.content, draft.pace, draft.remark, draft.supplement].some((value) => value.trim()); }

export type MonthlyPlanningEditorHandle = { save: () => Promise<boolean> };

const SCOPE_LABELS: Record<ScheduleScope, string> = { all: "全体", middle_long: "中長距離", short: "短距離" };
const STATE_PRIORITY: RowState[] = ["error", "saving", "dirty", "saved"];

/**
 * 1か月の練習予定とメニューをまとめて入力する。1日1行で並べ、行を開くとその日の予定とメニューを
 * 続けて編集できる。メニューの公開状態・個人指定などは「メニューの設定」に畳み、要約だけ常に見せる。
 */
export const MonthlyPlanningEditorV2 = forwardRef<MonthlyPlanningEditorHandle, { canSchedule?: boolean; canMenu?: boolean; onDirtyChange?: (dirty: boolean) => void; onDraftChange?: (draft: Parameters<typeof useFormDraft>[0] | null) => void; onSaved?: () => void; onClose?: () => void }>(function MonthlyPlanningEditorV2({ canSchedule = true, canMenu = true, onDirtyChange, onDraftChange, onSaved, onClose }, ref) {
  const now = new Date();
  const [openDates, setOpenDates] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [block, setBlock] = useState<Block>("middle_long");
  const [scheduleScope, setScheduleScope] = useState<ScheduleScope>("all");
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [status, setStatus] = useState<"draft" | "published">("published");
  const [members, setMembers] = useState<AuthorMini[]>([]);
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [schedules, setSchedules] = useState<Record<string, PracticeSchedule>>({});
  const [scheduleDrafts, setScheduleDrafts] = useState<Record<string, ScheduleDraft>>({});
  const [menuDrafts, setMenuDrafts] = useState<Record<string, MenuDraft>>({});
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [savingAll, setSavingAll] = useState(false);
  const [uncertainSave, setUncertainSave] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<string[]>([]);

  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  // 予定とメニューは同じ一覧で編集する。一覧の対象（全体・中長距離・短距離）が予定の読込先を決める。
  const activeScheduleScope: ScheduleScope = scheduleScope;
  const localDraftKey = `track-app:monthly-planner:${monthKey}:${activeScheduleScope}`;
  const days = useMemo(() => Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => {
    const date = `${monthKey}-${String(index + 1).padStart(2, "0")}`;
    return { date, day: index + 1, weekday: WEEKDAYS[new Date(year, month - 1, index + 1).getDay()] };
  }), [month, monthKey, year]);
  const sheetBackedCommonMenu = block === "middle_long" && targetIds.length === 0;

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    const start = `${monthKey}-01`;
    const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    void Promise.all([
      supabase.from("practice_schedules").select("*").gte("schedule_date", start).lt("schedule_date", end).order("schedule_date"),
      supabase.from("profiles").select("id, display_name, avatar_url, blocks, grade").eq("status", "active").order("display_name"),
      supabase.from("venues").select("*").order("pinned", { ascending: false }).order("sort"),
    ]).then(([scheduleResult, memberResult, venueResult]) => {
      if (!active) return;
      const allRows = (scheduleResult.data ?? []) as PracticeSchedule[];
      const rows = activeScheduleScope === "all"
        ? allRows.filter((row) => row.target_blocks.length === 0)
        : [...new Map(
            allRows
              .filter((row) => row.target_blocks.length === 0 || (row.target_blocks.length === 1 && row.target_blocks[0] === activeScheduleScope))
              .sort((a, b) => a.target_blocks.length - b.target_blocks.length)
              .map((row) => [row.schedule_date, row]),
          ).values()];
      const byDate: Record<string, PracticeSchedule> = {};
      const drafts: Record<string, ScheduleDraft> = {};
      rows.forEach((row) => { byDate[row.schedule_date] = row; drafts[row.schedule_date] = { id: row.id, time: row.meeting_time?.slice(0, 5) ?? "", venue: row.venue_name ?? row.location ?? "", note: row.note ?? "", scope: scopeOf(row.target_blocks) }; });
      const local = readStored<{ schedules?: Record<string, ScheduleDraft> }>(localDraftKey, {});
      setSchedules(byDate); setScheduleDrafts({ ...drafts, ...(local.schedules ?? {}) });
      setMembers((memberResult.data ?? []) as AuthorMini[]); setVenues((venueResult.data ?? []) as VenueRow[]);
    });
    return () => { active = false; };
  }, [activeScheduleScope, localDraftKey, month, monthKey, year]);

  useEffect(() => {
    let active = true;
    const scheduleRows = Object.values(schedules);
    const scheduleIds = scheduleRows.map((schedule) => schedule.id);
    if (!scheduleIds.length) return;

    async function loadMenus() {
      const drafts: Record<string, MenuDraft> = {};
      if (sheetBackedCommonMenu) {
        const response = await fetch(`/api/middle-long-menus?months=${month}`, { cache: "no-store" });
        if (response.ok) {
          const snapshot = await response.json() as {
            rows: Array<{
              exactDate: string | null;
              monthDay: string;
              sourceMonth: number;
              content: string;
              pace: string;
              remark: string;
              supplement: string;
            }>;
          };
          for (const schedule of scheduleRows) {
            const row = snapshot.rows.find((item) =>
              item.sourceMonth === month &&
              (item.exactDate === schedule.schedule_date ||
                (item.exactDate === null && item.monthDay === schedule.schedule_date.slice(5)))
            );
            if (!row) continue;
            drafts[schedule.schedule_date] = {
              content: row.content,
              pace: row.pace,
              remark: row.remark,
              supplement: row.supplement,
            };
          }
        }
      } else {
        const { data } = await createClient()
          .from("practice_menus")
          .select("*, targets:practice_menu_targets(user_id)")
          .in("schedule_id", scheduleIds)
          .eq("target_block", block);
        const dateById = new Map(scheduleRows.map((schedule) => [schedule.id, schedule.schedule_date]));
        for (const menu of (data ?? []) as PracticeMenu[]) {
          const targets = menu.targets?.map((target) => target.user_id) ?? [];
          if ([...targets].sort().join(",") !== [...targetIds].sort().join(",")) continue;
          const date = dateById.get(menu.schedule_id);
          if (!date) continue;
          drafts[date] = {
            id: menu.id,
            content: menu.content ?? "",
            pace: menu.pace ?? "",
            remark: menu.remark ?? "",
            supplement: menu.supplement ?? "",
          };
        }
      }
      if (!active) return;
      const local = readStored<{ menus?: Record<string, MenuDraft> }>(localDraftKey, {});
      setMenuDrafts({ ...drafts, ...(local.menus ?? {}) });
      if (sheetBackedCommonMenu) {
        setExpandedDates(Object.entries(drafts)
          .filter(([, draft]) => !!(draft.pace || draft.remark || draft.supplement))
          .map(([date]) => date));
      }
    }

    void loadMenus();
    return () => { active = false; };
  }, [block, localDraftKey, month, schedules, sheetBackedCommonMenu, targetIds]);
  useEffect(() => {
    if (!Object.values(rowStates).some((state) => state === "dirty" || state === "error")) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(localDraftKey, JSON.stringify({ schedules: scheduleDrafts, menus: menuDrafts }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [localDraftKey, menuDrafts, rowStates, scheduleDrafts]);

  function moveMonth(delta: number) { const next = new Date(year, month - 1 + delta, 1); setYear(next.getFullYear()); setMonth(next.getMonth() + 1); setRowStates({}); setMenuDrafts({}); }
  function stateKey(kind: "schedule" | "menu", date: string) { return `${kind}:${date}`; }
  function markDirty(kind: "schedule" | "menu", date: string) { setRowStates((current) => ({ ...current, [stateKey(kind, date)]: "dirty" })); }
  function updateSchedule(date: string, patch: Partial<ScheduleDraft>) { setScheduleDrafts((current) => ({ ...current, [date]: { id: current[date]?.id, time: current[date]?.time ?? "", venue: current[date]?.venue ?? "", note: current[date]?.note ?? "", scope: current[date]?.scope, ...patch } })); markDirty("schedule", date); }
  function updateMenu(date: string, patch: Partial<MenuDraft>) { setMenuDrafts((current) => ({ ...current, [date]: { id: current[date]?.id, content: current[date]?.content ?? "", pace: current[date]?.pace ?? "", remark: current[date]?.remark ?? "", supplement: current[date]?.supplement ?? "", ...patch } })); markDirty("menu", date); }

  async function saveSchedule(date: string): Promise<PracticeSchedule | null> {
    const draft = scheduleDrafts[date]; if (!isScheduleSavable(draft)) return schedules[date] ?? null;
    if (!canSchedule) return null;
    setRowStates((current) => ({ ...current, [stateKey("schedule", date)]: "saving" }));
    const supabase = createClient();
    let userId: string | null;
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      userId = authError ? null : user?.id ?? null;
    } catch { userId = null; }
    if (!userId) {
      setError("ログインを確認できませんでした。もう一度お試しください");
      setRowStates((current) => ({ ...current, [stateKey("schedule", date)]: "error" }));
      return null;
    }
    const scope = draft.scope ?? activeScheduleScope;
    // 対象を付け替えるときは、移動先に同じ日の予定が既にないか確かめる（同じ対象の重複を作らない）。
    if (draft.id && scope !== scopeOf(schedules[date]?.target_blocks ?? [])) {
      const check = await supabase
        .from("practice_schedules")
        .select("id,target_blocks")
        .eq("schedule_date", date)
        .then((result) => result, () => ({ data: null, error: true }));
      if (check.error || !check.data) {
        setError("移動先の予定を確認できませんでした。もう一度お試しください");
        setRowStates((current) => ({ ...current, [stateKey("schedule", date)]: "error" }));
        return null;
      }
      const clash = check.data.some(
        (row) => row.id !== draft.id && scopeOf(row.target_blocks as Block[]) === scope,
      );
      if (clash) {
        setError(`${date} には移動先の対象の予定が既にあります。先にそちらを整理してください。`);
        setRowStates((current) => ({ ...current, [stateKey("schedule", date)]: "error" }));
        return null;
      }
    }
    const payload = { schedule_date: date, schedule_type: "practice", meeting_time: draft.time || null, venue_name: draft.venue || null, ...venueDetails(venues, draft.venue || null), note: draft.note || null, target_blocks: blocksOf(scope) };
    const result = draft.id ? await supabase.from("practice_schedules").update(payload).eq("id", draft.id).select("*").single() : await supabase.from("practice_schedules").insert({ ...payload, created_by: userId }).select("*").single();
    if ((result.error && !result.error.code) || (!result.error && !result.data)) throw new Error("Schedule save result unknown");
    if (result.error) { setRowStates((current) => ({ ...current, [stateKey("schedule", date)]: "error" })); return null; }
    const saved = result.data as PracticeSchedule; setSchedules((current) => ({ ...current, [date]: saved })); setScheduleDrafts((current) => ({ ...current, [date]: { ...current[date], id: saved.id, scope: scopeOf(saved.target_blocks) } })); setRowStates((current) => ({ ...current, [stateKey("schedule", date)]: "saved" })); return saved;
  }

  async function ensureSchedule(date: string): Promise<PracticeSchedule | null> {
    if (schedules[date]) return schedules[date];
    // 入力した予定の保存が拒否・不明なら、別の新規作成へ進めない。
    if (isScheduleSavable(scheduleDrafts[date])) return saveSchedule(date);
    const supabase = createClient();
    let userId: string | null;
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      userId = authError ? null : user?.id ?? null;
    } catch { userId = null; }
    if (!userId) return null;
    const { data, error: createError } = await supabase.from("practice_schedules").insert({
      schedule_date: date,
      schedule_type: "practice",
      created_by: userId,
      target_blocks: blocksOf(scheduleScope),
    }).select("*").single();
    if ((createError && !createError.code) || (!createError && !data)) throw new Error("Schedule creation result unknown");
    if (createError || !data) return null;
    const schedule = data as PracticeSchedule; setSchedules((current) => ({ ...current, [date]: schedule })); return schedule;
  }

  async function saveMenu(date: string, savedSchedule?: PracticeSchedule) {
    const draft = menuDrafts[date];
    if (!draft || (!hasMenuValue(draft) && !sheetBackedCommonMenu)) return true;
    setRowStates((current) => ({ ...current, [stateKey("menu", date)]: "saving" }));
    const schedule = savedSchedule ?? await ensureSchedule(date);
    if (!schedule) {
      setRowStates((current) => ({ ...current, [stateKey("menu", date)]: "error" }));
      return false;
    }

    if (sheetBackedCommonMenu) {
      const response = await fetch("/api/middle-long-menus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: schedule.id,
          content: draft.content,
          pace: draft.pace,
          remark: draft.remark,
          supplement: draft.supplement,
        }),
      });
      if (!response.ok) {
        if (response.status >= 500) throw new Error("Menu save result unknown");
        setRowStates((current) => ({ ...current, [stateKey("menu", date)]: "error" }));
        return false;
      }
      setRowStates((current) => ({ ...current, [stateKey("menu", date)]: "saved" }));
      return true;
    }

    const { data, error: saveError } = await createClient().rpc("save_practice_menu", {
      target_schedule_id: schedule.id,
      menu_content: draft.content.trim(),
      menu_status: status,
      menu_target_block: block,
      target_user_ids: targetIds,
      target_menu_id: draft.id ?? undefined,
      menu_pace: draft.pace.trim() || undefined,
      menu_remark: draft.remark.trim() || undefined,
      menu_supplement: targetIds.length === 0 ? draft.supplement.trim() || undefined : undefined,
    });
    if ((saveError && !saveError.code) || (!saveError && typeof data !== "string")) throw new Error("Menu save result unknown");
    if (saveError) {
      setRowStates((current) => ({ ...current, [stateKey("menu", date)]: "error" }));
      return false;
    }
    setMenuDrafts((current) => ({ ...current, [date]: { ...current[date], id: data as string } }));
    setRowStates((current) => ({ ...current, [stateKey("menu", date)]: "saved" }));
    return true;
  }
  async function saveAll(): Promise<boolean> {
    if (savingAll || uncertainSave) return false;
    setSavingAll(true); setError(null);
    try {
      const needsSave = (key: string) => rowStates[key] === "dirty" || rowStates[key] === "error";
      const scheduleDates = days.map((day) => day.date).filter((date) => needsSave(stateKey("schedule", date)) && isScheduleSavable(scheduleDrafts[date]));
      const menuDates = days.map((day) => day.date).filter((date) => needsSave(stateKey("menu", date)) && (sheetBackedCommonMenu || hasMenuValue(menuDrafts[date])));
      const selectedKeys = new Set([...scheduleDates.map((date) => stateKey("schedule", date)), ...menuDates.map((date) => stateKey("menu", date))]);
      const excludedKeys = Object.keys(rowStates).filter((key) => needsSave(key) && !selectedKeys.has(key));
      let failed = excludedKeys.length;
      if (excludedKeys.length) setRowStates((current) => ({ ...current, ...Object.fromEntries(excludedKeys.map((key) => [key, "error" as const])) }));
      const failedScheduleDates = new Set<string>();
      const savedSchedules = new Map<string, PracticeSchedule>();
      for (const date of scheduleDates) {
        const saved = await saveSchedule(date);
        if (!saved) { failed++; failedScheduleDates.add(date); }
        else savedSchedules.set(date, saved);
      }
      for (const date of menuDates) {
        // 同じ一括保存内で予定保存が失敗した行をもう一度送らない。
        if (failedScheduleDates.has(date) || !await saveMenu(date, savedSchedules.get(date))) failed++;
      }
      if (failed) setError(`${failed}件を保存できませんでした。赤い行を確認してください。`);
      else { localStorage.removeItem(localDraftKey); }
      return failed === 0;
    } catch {
      setUncertainSave(true);
      setRowStates((current) => Object.fromEntries(Object.entries(current).map(([key, state]) => [key, state === "saving" ? "error" : state])));
      return false;
    } finally {
      setSavingAll(false);
    }
  }

  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  // 予定を作れない人（メニューだけ書く人）には、予定がある日だけを出す。
  const visibleDays = (!canSchedule
    ? days.filter(({ date }) => !!schedules[date])
    : showActiveOnly
      ? days.filter(({ date }) => schedules[date] || hasScheduleValue(scheduleDrafts[date]))
      : days
  ).toSorted((a, b) => {
    const aPast = a.date < today;
    const bPast = b.date < today;
    return aPast === bPast ? a.date.localeCompare(b.date) : aPast ? 1 : -1;
  });
  const dirtyCount = Object.values(rowStates).filter((state) => state === "dirty" || state === "error").length;
  const hasDirtyChanges = dirtyCount > 0;
  useEffect(() => { onDirtyChange?.(hasDirtyChanges); }, [hasDirtyChanges, onDirtyChange]);
  useImperativeHandle(ref, () => ({ save: saveAll }));
  const saveBatch = saveAll;
  const busy = savingAll || uncertainSave;
  useFormDraft({ dirty: hasDirtyChanges, busy, onSave: async () => { if (await saveBatch()) onSaved?.(); } });
  useEffect(() => {
    onDraftChange?.({ dirty: hasDirtyChanges, busy, onSave: async () => { if (await saveBatch()) onSaved?.(); } });
  }, [onDraftChange, hasDirtyChanges, busy, saveBatch, onSaved]);
  useEffect(() => () => onDraftChange?.(null), [onDraftChange]);
  function isExpanded(date: string) { return expandedDates.includes(date); }
  function toggleExpanded(date: string) { setExpandedDates((current) => current.includes(date) ? current.filter((item) => item !== date) : [...current, date]); }
  function isOpen(date: string) { return openDates.includes(date); }
  function toggleOpen(date: string) { setOpenDates((current) => current.includes(date) ? current.filter((item) => item !== date) : [...current, date]); }
  /** 予定とメニューのうち、いちばん注意が要る状態を行に出す。 */
  function dayState(date: string): RowState | undefined {
    const states = [rowStates[stateKey("schedule", date)], rowStates[stateKey("menu", date)]];
    return STATE_PRIORITY.find((state) => states.includes(state));
  }
  function changeScope(next: ScheduleScope) {
    if (hasDirtyChanges) localStorage.setItem(localDraftKey, JSON.stringify({ schedules: scheduleDrafts, menus: menuDrafts }));
    setScheduleScope(next); setSchedules({}); setScheduleDrafts({}); setRowStates({});
    // 中長距離・短距離の一覧では、そのブロックのメニューを書く。全体の一覧だけ設定で選ぶ。
    if (next !== "all") setBlock(next);
  }
  const menuSaveLabel = sheetBackedCommonMenu ? "スプレッドシートへ保存" : status === "published" ? "公開" : "下書き";
  const menuSettingsSummary = `${BLOCKS[block].label}・${targetIds.length ? `${targetIds.length}人を個人指定` : "ブロック全体"}・${menuSaveLabel}`;
  const menuLabel = `メニュー（${BLOCKS[block].label}${targetIds.length ? "・個人指定" : ""}）`;

  return <div className="space-y-4"><fieldset disabled={busy} className="min-w-0 space-y-4">
    <SegmentedControl items={(Object.keys(SCOPE_LABELS) as ScheduleScope[]).map((key) => ({ key, label: SCOPE_LABELS[key] }))} value={scheduleScope} onChange={(value) => changeScope(value as ScheduleScope)} />
    <div className="flex items-center justify-between rounded-xl bg-bg px-2 py-1"><button data-ui-action="icon" type="button" aria-label="前の月" onClick={() => moveMonth(-1)} className="flex h-11 w-11 items-center justify-center rounded-full pressable focus-visible:outline-2 focus-visible:outline-accent"><ChevronLeft aria-hidden="true" /></button><strong>{year}年{month}月</strong><button data-ui-action="icon" type="button" aria-label="次の月" onClick={() => moveMonth(1)} className="flex h-11 w-11 items-center justify-center rounded-full pressable focus-visible:outline-2 focus-visible:outline-accent"><ChevronRight aria-hidden="true" /></button></div>
    {canMenu && <div className={`rounded-xl border bg-card ${!sheetBackedCommonMenu && status === "draft" ? "border-warning/50" : "border-separator"}`}>
      <button data-ui-disclosure type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)} className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">メニューの設定</span>
          <span className={`block text-xs ${!sheetBackedCommonMenu && status === "draft" ? "font-semibold text-warning" : "text-muted"}`}>{menuSettingsSummary}</span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-muted transition-transform ${settingsOpen ? "rotate-180" : ""}`} />
      </button>
      {settingsOpen && <div className="space-y-3 border-t border-separator p-3">
        {scheduleScope === "all" && <Select value={block} onValueChange={(value) => setBlock(value as Block)} ariaLabel="メニューのブロック" options={EDITABLE_BLOCK_ORDER.map((item) => ({ value: item, label: BLOCKS[item].label }))} />}
        <PersonPicker people={members} value={targetIds} onChange={setTargetIds} label="個人指定（空ならブロック全体）" />
        {sheetBackedCommonMenu ? (
          <p className="rounded-xl bg-accent/5 px-3 py-2 text-xs text-muted">
            中長距離のブロック全体メニューは、GASを通して月別スプレッドシートへ保存します。
          </p>
        ) : (
          <div className={`rounded-xl border p-3 ${status === "published" ? "border-accent/30 bg-accent/5" : "border-warning/30 bg-warning/5"}`}><p className="section-label mb-2">保存後の状態</p><SegmentedControl items={[{ key: "published", label: "公開" }, { key: "draft", label: "下書き" }]} value={status} onChange={(value) => setStatus(value as "draft" | "published")} /><p className="mt-2 text-xs text-muted">{status === "published" ? "保存するとすぐに部員へ公開されます" : MENU_DRAFT_VISIBILITY_DESCRIPTION}</p></div>
        )}
      </div>}
    </div>}
    <div className="flex items-center justify-between gap-3">{canSchedule ? <SegmentedControl className="w-52" items={[{ key: "all", label: "すべての日" }, { key: "active", label: "予定あり" }]} value={showActiveOnly ? "active" : "all"} onChange={(value) => setShowActiveOnly(value === "active")} /> : <span className="text-xs text-muted">予定がある日のみ表示</span>}<span className="shrink-0 text-xs text-muted">変更 {dirtyCount}件</span></div>
    <div className="space-y-2">{visibleDays.map(({ date, day, weekday }) => {
      const draft = scheduleDrafts[date];
      const state = dayState(date);
      const open = isOpen(date);
      // メニューは予定に付く。予定がない日は、集合時間か場所を入れると書けるようになる。
      const menuReady = !!schedules[date] || hasScheduleValue(draft);
      const venueLabel = draft?.venue ? venues.find((venue) => venue.name === draft.venue)?.short || draft.venue : "";
      const summary = [draft?.time, venueLabel].filter(Boolean).join("・");
      return <section key={date} data-planning-day={date} className={`rounded-xl border bg-card ${state === "error" ? "border-danger" : "border-separator"}`}>
        <button type="button" data-ui-disclosure aria-expanded={open} onClick={() => toggleOpen(date)} className="flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left">
          <strong className={`min-w-[5.75rem] shrink-0 whitespace-nowrap text-sm tabular-nums ${date === today ? "text-accent" : ""}`}>{month}/{day}（{weekday}）</strong>
          <span className={`min-w-0 flex-1 truncate text-xs ${summary ? "text-ink" : "text-muted"}`}>{summary || (menuReady ? "予定あり" : "予定なし")}</span>
          {canMenu && hasMenuValue(menuDrafts[date]) && <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">メニュー</span>}
          <RowStatus state={state} />
          <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && <div className="space-y-4 border-t border-separator p-3">
      {canSchedule ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <MeetingTimeField value={draft?.time ?? ""} onChange={(time) => updateSchedule(date, { time })} />
            <VenueField label="練習場所" venues={venues} value={draft?.venue ?? ""} onChange={(venue) => updateSchedule(date, { venue })} />
          </div>
          {isScheduleSavable(draft) && (
            <div>
              <p className="section-label mb-1.5">対象</p>
              <SegmentedControl
                items={(Object.keys(SCOPE_LABELS) as ScheduleScope[]).map((key) => ({ key, label: SCOPE_LABELS[key] }))}
                value={draft?.scope ?? activeScheduleScope}
                onChange={(value) => updateSchedule(date, { scope: value as ScheduleScope })}
              />
              {(draft?.scope ?? activeScheduleScope) !== activeScheduleScope && (
                <p className="mt-1 text-xs text-warning">
                  保存すると、この予定は「{SCOPE_LABELS[draft?.scope ?? activeScheduleScope]}」へ移ります。
                </p>
              )}
            </div>
          )}
          <div>
            <p className="section-label mb-1.5">詳細</p>
            <Textarea autoGrow rows={2} className="min-h-16" placeholder="例: 集合方法、持ち物" value={draft?.note ?? ""} onChange={(event) => updateSchedule(date, { note: event.target.value })} />
          </div>
        </div>
      ) : draft?.note ? <p className="whitespace-pre-wrap text-xs text-muted">{draft.note}</p> : null}
      {canMenu && (menuReady ? (
        <div className="space-y-3 border-t border-separator pt-3">
          <div>
            <p className="section-label mb-1.5">{menuLabel}</p>
            <Textarea autoGrow rows={3} className="min-h-20" placeholder="例: 400m×10（つなぎ200m）" value={menuDrafts[date]?.content ?? ""} onChange={(event) => updateMenu(date, { content: event.target.value })} />
          </div>
          {(block === "middle_long" || block === "short") && <button data-ui-disclosure aria-expanded={isExpanded(date)} type="button" onClick={() => toggleExpanded(date)} className="inline-flex items-center gap-1 text-xs font-semibold text-accent">{isExpanded(date) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{isExpanded(date) ? "詳細を閉じる" : block === "middle_long" ? "ペース・補足・補強を入力" : "説明を入力"}</button>}
          {block === "middle_long" && isExpanded(date) && <>
            <div>
              <p className="section-label mb-1.5">ペース</p>
              <Textarea autoGrow rows={2} className="min-h-16" placeholder="例: 距離ごとの設定ペース" value={menuDrafts[date]?.pace ?? ""} onChange={(event) => updateMenu(date, { pace: event.target.value })} />
            </div>
            <div>
              <p className="section-label mb-1.5">補足</p>
              <Textarea autoGrow rows={2} className="min-h-16" placeholder="例: 変更条件、注意点" value={menuDrafts[date]?.remark ?? ""} onChange={(event) => updateMenu(date, { remark: event.target.value })} />
            </div>
            {targetIds.length === 0 && <div>
              <p className="section-label mb-1.5">補強</p>
              <Textarea autoGrow rows={2} className="min-h-16" placeholder="補強内容を入力" value={menuDrafts[date]?.supplement ?? ""} onChange={(event) => updateMenu(date, { supplement: event.target.value })} />
            </div>}
          </>}
          {block === "short" && isExpanded(date) && <div>
            <p className="section-label mb-1.5">説明</p>
            <Textarea autoGrow rows={2} className="min-h-16" placeholder="例: 目的、走り方、注意点" value={menuDrafts[date]?.remark ?? ""} onChange={(event) => updateMenu(date, { remark: event.target.value })} />
          </div>}
        </div>
      ) : <p className="border-t border-separator pt-3 text-xs text-muted">集合時間か練習場所を入れると、メニューも書けます。</p>)}
        </div>}
      </section>;
    })}</div>
    {error && <p className="text-center text-caption text-danger">{error}</p>}
    <FormModalFooter><Button size="lg" className={`w-full ${savingAll ? "opacity-100" : ""}`} disabled={busy || dirtyCount === 0} onClick={() => { void saveAll().then((ok) => { if (ok) onSaved?.(); }); }}>{savingAll ? <><LoaderCircle size={18} className="animate-spin" />保存中…</> : <><Save size={17} />変更をまとめて保存（{dirtyCount}件）</>}</Button></FormModalFooter>
    </fieldset>
    {uncertainSave && <div role="alert" className="space-y-2 text-caption text-danger">
      <p>保存結果を確認できませんでした。予定一覧の予定とメニューを確認してください</p>
      <Button type="button" variant="outline" asChild><a href="/schedule" target="_blank" rel="noreferrer">予定一覧を確認</a></Button>
      <Button type="button" variant="outline" onClick={() => {
        localStorage.removeItem(localDraftKey); setRowStates({}); setUncertainSave(false); onClose?.();
      }}>結果を確認して、今回の入力を終了</Button>
    </div>}
  </div>;
});

function RowStatus({ state }: { state?: RowState }) {
  if (state === "saving") return <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted"><LoaderCircle size={13} className="animate-spin" />保存中</span>;
  if (state === "saved") return <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-success"><Check size={13} />保存済み</span>;
  if (state === "error") return <span className="ml-auto text-xs font-semibold text-danger">保存失敗</span>;
  if (state === "dirty") return <span className="ml-auto text-xs text-warning">未保存</span>;
  return null;
}
