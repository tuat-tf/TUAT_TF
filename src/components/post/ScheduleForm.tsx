"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, X } from "lucide-react";
import { getCurrentUserId } from "@/lib/supabase/client-auth";
import { createClient } from "@/lib/supabase/client";
import { safeUpdate, safeUpdateMessage } from "@/lib/safe-update";
import { saveNewSchedule, scheduleCreateMessage, type PendingScheduleCreate } from "@/lib/schedule-create";
import { ActionMenu } from "@/components/ui/action-menu";
import { FormModal, FormModalFooter, useFormDraft } from "@/components/ui/form-modal";
import { UnsavedChangesDialog } from "@/components/ui/unsaved-changes-dialog";
import { SegmentedControl } from "@/components/ui/segmented";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { ScheduleSheetsManager } from "@/components/features/ScheduleSheetsManager";
import {
  BLOCKS,
  ENTRY_PERIOD_TYPES,
  SCHEDULE_TYPE_OPTIONS,
  normalizeProfileBlocks,
} from "@/lib/constants";
import type { Block, PracticeSchedule, ScheduleType, VenueRow } from "@/types";

const OTHER = "__other__";

export function ScheduleCreatePanel({ onDone }: { onDone: () => void }) {
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"normal" | "sheets">(
    searchParams.get("sheets") === "1" ? "sheets" : "normal",
  );
  const [pendingMode, setPendingMode] = useState<typeof mode | null>(null);
  const importDraft = useRef<Parameters<typeof useFormDraft>[0] | null>(null);
  const [draftFlags, setDraftFlags] = useState({ dirty: false, busy: false });
  const onDraftChange = useCallback((draft: Parameters<typeof useFormDraft>[0] | null) => {
    importDraft.current = draft;
    const next = { dirty: !!draft?.dirty, busy: !!draft?.busy };
    setDraftFlags((current) => current.dirty === next.dirty && current.busy === next.busy ? current : next);
  }, []);

  return (
    <div className="space-y-5">
      <fieldset disabled={draftFlags.busy}>
        <SegmentedControl
          items={[
            { key: "normal", label: "通常入力" },
            { key: "sheets", label: "スプレッドシートから入力" },
          ]}
          value={mode}
          onChange={(next) => {
            if (next === mode || draftFlags.busy) return;
            if (draftFlags.dirty) setPendingMode(next);
            else setMode(next);
          }}
        />
      </fieldset>
      {mode === "normal" ? <ScheduleForm onDone={onDone} onDraftChange={onDraftChange} /> : <ScheduleSheetsManager onDraftChange={onDraftChange} />}
      <UnsavedChangesDialog
        open={pendingMode !== null}
        busy={draftFlags.busy}
        onContinue={() => setPendingMode(null)}
        onDiscard={() => {
          if (draftFlags.busy || pendingMode === null) return;
          setMode(pendingMode); setPendingMode(null);
        }}
        onSave={() => {
          if (draftFlags.busy) return;
          setPendingMode(null); void importDraft.current?.onSave();
        }}
      />
    </div>
  );
}

export function ScheduleForm({
  schedule,
  initialType,
  showTypeSelector = true,
  onDone,
  onDraftChange,
}: {
  schedule?: PracticeSchedule;
  initialType?: ScheduleType;
  showTypeSelector?: boolean;
  onDone: () => void;
  onDraftChange?: (draft: Parameters<typeof useFormDraft>[0] | null) => void;
}) {
  const router = useRouter();
  const editing = !!schedule;

  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [type, setType] = useState<ScheduleType>(
    schedule?.schedule_type ?? initialType ?? "practice",
  );
  const [date, setDate] = useState(schedule?.schedule_date ?? "");
  const [meetingTime, setMeetingTime] = useState(schedule?.meeting_time?.slice(0, 5) ?? "");
  const [initialMeetingTime, setInitialMeetingTime] = useState(schedule?.meeting_time?.slice(0, 5) ?? "");
  const [venueKey, setVenueKey] = useState<string>(schedule?.venue_name ? OTHER : "");
  const [otherVenue, setOtherVenue] = useState(schedule?.venue_name ?? "");
  const [title, setTitle] = useState(schedule?.title ?? "");
  const [useEndDate, setUseEndDate] = useState(!!schedule?.end_date);
  const [endDate, setEndDate] = useState(schedule?.end_date ?? "");
  const [useEntry, setUseEntry] = useState(!!(schedule?.entry_start || schedule?.entry_end));
  const [entryStart, setEntryStart] = useState(schedule?.entry_start ?? "");
  const [entryEnd, setEntryEnd] = useState(schedule?.entry_end ?? "");
  const [note, setNote] = useState(schedule?.note ?? "");
  const [targetBlocks, setTargetBlocks] = useState<Block[]>(normalizeProfileBlocks(schedule?.target_blocks));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"date" | "title" | null>(null);
  const formId = useId();
  const dateInput = useRef<HTMLInputElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const meetingTimeTouched = useRef(false);
  const [pendingCreate, setPendingCreate] = useState<PendingScheduleCreate | null>(null);
  const submissionLocked = useRef(false);
  const createConfirmed = useRef(false);

  const isPractice = type === "practice";
  const canEntry = ENTRY_PERIOD_TYPES.includes(type);

  // 場所リスト（pinned）をDBから取得。編集時は保存済み会場名を選択状態に復元。
  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const userId = await getCurrentUserId(supabase);
      const [venueResult, previousTimeResult] = await Promise.all([
        supabase
          .from("venues")
          .select("*")
          .eq("pinned", true)
          .order("sort", { ascending: true })
          .order("name", { ascending: true }),
        !schedule && isPractice && userId
          ? supabase
              .from("practice_schedules")
              .select("meeting_time")
              .eq("created_by", userId)
              .eq("schedule_type", "practice")
              .not("meeting_time", "is", null)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!active) return;
      const list = (venueResult.data ?? []) as VenueRow[];
      setVenues(list);
      const previousTime = previousTimeResult.data?.meeting_time;
      if (!schedule && previousTime && !meetingTimeTouched.current) {
        setMeetingTime(previousTime.slice(0, 5));
        setInitialMeetingTime(previousTime.slice(0, 5));
      }
      if (schedule?.venue_name) {
        const match = list.find((v) => v.name === schedule.venue_name);
        if (match) {
          setVenueKey(match.id);
          setOtherVenue("");
        }
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(async () => {
    if (submissionLocked.current) return;
    setErrorField(null);
    if (!date) {
      setError("日付を選択してください");
      setErrorField("date");
      dateInput.current?.focus();
      return;
    }
    if (!isPractice && !title.trim()) {
      setError("タイトルを入力してください");
      setErrorField("title");
      titleInput.current?.focus();
      return;
    }
    submissionLocked.current = true;
    meetingTimeTouched.current = true;
    setSaving(true);
    setError(null);
    try {
      if (createConfirmed.current) {
        router.refresh();
        onDone();
        return;
      }
      const supabase = createClient();
      const venue = venueKey && venueKey !== OTHER ? venues.find((item) => item.id === venueKey) : undefined;
      const venueName = venue ? venue.name : venueKey === OTHER ? otherVenue.trim() || null : null;
      const payload = {
        schedule_date: date,
        schedule_type: type,
        meeting_time: meetingTime || null,
        venue_name: venueName,
        venue_access: venue ? venue.access : null,
        venue_fee: venue ? venue.fee : null,
        venue_url: venue ? venue.url : null,
        title: !isPractice ? title.trim() || null : null,
        end_date: !isPractice && useEndDate && endDate ? endDate : null,
        entry_start: canEntry && useEntry && entryStart ? entryStart : null,
        entry_end: canEntry && useEntry && entryEnd ? entryEnd : null,
        note: note.trim() || null,
        target_blocks: targetBlocks,
      };

      if (editing) {
        const result = await safeUpdate(supabase, "practice_schedules", payload, { id: schedule!.id });
        if (!result.ok) {
          setError(safeUpdateMessage(result.reason));
          return;
        }
      } else {
        let attempt = pendingCreate;
        if (!attempt) {
          const { data, error: authError } = await supabase.auth.getClaims();
          const userId = data?.claims.sub;
          if (authError || !userId) {
            setError(scheduleCreateMessage("forbidden"));
            return;
          }
          attempt = {
            row: { ...payload, target_blocks: [...targetBlocks], id: crypto.randomUUID(), created_by: userId },
            uncertain: false,
          };
          setPendingCreate(attempt);
        }
        const result = await saveNewSchedule(supabase, attempt);
        if (!result.ok) {
          if (!attempt.uncertain) setPendingCreate(null);
          setError(scheduleCreateMessage(result.reason));
          return;
        }
        createConfirmed.current = true;
      }
      router.refresh();
      onDone();
    } catch {
      setError("保存できませんでした。入力は残っています。ログイン状態と保存結果を確認してください");
    } finally {
      submissionLocked.current = false;
      setSaving(false);
    }
  }, [pendingCreate, date, isPractice, title, venueKey, venues, otherVenue, type, meetingTime, useEndDate, endDate, canEntry, useEntry, entryStart, entryEnd, note, targetBlocks, editing, schedule, router, onDone]);

  const selectedVenueName = venueKey === OTHER ? otherVenue : venues.find((venue) => venue.id === venueKey)?.name ?? "";
  const draftDirty = type !== (schedule?.schedule_type ?? initialType ?? "practice") ||
    date !== (schedule?.schedule_date ?? "") || meetingTime !== initialMeetingTime ||
    selectedVenueName !== (schedule?.venue_name ?? "") || title !== (schedule?.title ?? "") ||
    useEndDate !== !!schedule?.end_date || endDate !== (schedule?.end_date ?? "") ||
    useEntry !== !!(schedule?.entry_start || schedule?.entry_end) ||
    entryStart !== (schedule?.entry_start ?? "") || entryEnd !== (schedule?.entry_end ?? "") ||
    note !== (schedule?.note ?? "") ||
    [...targetBlocks].sort().join(",") !== [...normalizeProfileBlocks(schedule?.target_blocks)].sort().join(",");
  useFormDraft({ dirty: draftDirty || !!pendingCreate, busy: saving, onSave: submit, intent: pendingCreate ? "check" : "save" });
  useEffect(() => {
    onDraftChange?.({ dirty: draftDirty || !!pendingCreate, busy: saving || !!pendingCreate, onSave: submit, intent: pendingCreate ? "check" : "save" });
  }, [onDraftChange, draftDirty, saving, submit, pendingCreate]);
  useEffect(() => () => onDraftChange?.(null), [onDraftChange]);

  return (
    <div className="space-y-4 pb-4">
    <fieldset disabled={saving || !!pendingCreate} className="min-w-0 space-y-4">
      {showTypeSelector && (
        <SegmentedControl
          items={SCHEDULE_TYPE_OPTIONS}
          value={type}
          onChange={(k) => {
            meetingTimeTouched.current = true;
            setType(k as ScheduleType);
          }}
        />
      )}

      <div>
        <p className="section-label mb-1.5">対象ブロック</p>
        <SegmentedControl
          items={[
            { key: "all", label: "全体" },
            ...(["middle_long", "short"] as const).map((block) => ({ key: block, label: BLOCKS[block].label })),
          ]}
          value={targetBlocks[0] ?? "all"}
          onChange={(value) => setTargetBlocks(value === "all" ? [] : [value as Block])}
        />
        <p className="text-micro mt-1.5">
          全体は中長距離・短距離の両方に表示されます。
        </p>
      </div>

      {/* 日付（選ぶだけで設定。追加ボタン不要） */}
      <div>
        <label htmlFor={`${formId}-date`} className="section-label mb-1.5 block">日付</label>
        <Input ref={dateInput} id={`${formId}-date`} type="date" value={date} aria-invalid={errorField === "date" || undefined} aria-describedby={errorField === "date" ? `${formId}-date-error` : undefined} onChange={(e) => { setDate(e.target.value); if (errorField === "date") { setErrorField(null); setError(null); } }} />
        {errorField === "date" && <p id={`${formId}-date-error`} role="alert" className="mt-1 text-caption text-danger">{error}</p>}
      </div>

      {/* 場所（選択式） */}
      <div>
        <p className="section-label mb-1.5">場所</p>
        <Select
          disabled={saving || !!pendingCreate}
          value={venueKey}
          onValueChange={setVenueKey}
          ariaLabel="場所"
          options={[
            { value: "", label: "選択しない" },
            ...venues.map((venue) => ({
              value: venue.id,
              label: venue.short ? `${venue.short}：${venue.name}` : venue.name,
            })),
            { value: OTHER, label: "その他（手入力）" },
          ]}
        />
        {venueKey === OTHER && (
          <Input
            className="mt-2"
            placeholder="場所名を入力"
            value={otherVenue}
            onChange={(e) => setOtherVenue(e.target.value)}
          />
        )}
        {venueKey && venueKey !== OTHER && (
          <p className="text-caption mt-1.5">アクセス・参加費は自動で登録されます</p>
        )}
      </div>

      {/* 種別ごとの項目（全画面モーダルなので高さが変わってもガクつかない） */}
      <div key={type} className="space-y-4 fade-in">
          <div>
            <p className="section-label mb-1.5">集合時間</p>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                aria-label="集合時間"
                value={meetingTime}
                onChange={(event) => {
                  meetingTimeTouched.current = true;
                  setMeetingTime(event.target.value);
                }}
              />
              <button data-ui-action="icon" data-ui-variant="ghost"
                type="button"
                onClick={() => {
                  meetingTimeTouched.current = true;
                  setMeetingTime("");
                }}
                disabled={!meetingTime}
                aria-label="集合時間をクリア"
                title="集合時間をクリア"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-separator bg-card text-muted active:bg-bg disabled:opacity-30"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        {!isPractice && (
          <>
            <div>
              <label htmlFor={`${formId}-title`} className="section-label mb-1.5 block">タイトル</label>
              <Input
                ref={titleInput}
                id={`${formId}-title`}
                aria-invalid={errorField === "title" || undefined}
                aria-describedby={errorField === "title" ? `${formId}-title-error` : undefined}
                placeholder={type === "meet" ? "例: 県選手権 / 合宿" : "例: 記録会"}
                value={title}
                onChange={(e) => { setTitle(e.target.value); if (errorField === "title") { setErrorField(null); setError(null); } }}
              />
              {errorField === "title" && <p id={`${formId}-title-error`} role="alert" className="mt-1 text-caption text-danger">{error}</p>}
            </div>

            {/* 終了日：複数日開催のときだけオン */}
            <div>
              <Toggle
                label="複数日開催（終了日を設定）"
                checked={useEndDate}
                onChange={() =>
                  setUseEndDate((v) => {
                    const next = !v;
                    if (next && !endDate && date) setEndDate(date);
                    return next;
                  })
                }
              />
              {useEndDate && (
                <div className="mt-2">
                  <p className="text-micro mb-1">終了日</p>
                  <Input
                    type="date"
                    value={endDate}
                    min={date || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* エントリー期間（大会・記録会） */}
        {canEntry && (
          <div>
            <Toggle
              label="エントリー期間を設定する"
              checked={useEntry}
              onChange={() => setUseEntry((v) => !v)}
            />
            {useEntry && (
              <div className="space-y-2 mt-2">
                <div>
                  <p className="text-micro mb-1">エントリー開始</p>
                  <Input type="date" value={entryStart} onChange={(e) => setEntryStart(e.target.value)} />
                </div>
                <div>
                  <p className="text-micro mb-1">エントリー締切</p>
                  <Input type="date" value={entryEnd} onChange={(e) => setEntryEnd(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 詳細情報：集合方法・持ち物・連絡事項など。予定カードに「詳細情報」として表示される */}
      <div>
        <p className="section-label mb-1.5">詳細情報</p>
        <Textarea
          autoGrow
          rows={3}
          placeholder="例: 集合方法・持ち物・連絡事項"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

    </fieldset>
      {error && !errorField && <p role="alert" className="text-caption text-danger text-center">{error}</p>}
      <FormModalFooter>
        <Button size="lg" onClick={submit} disabled={saving}>
          {saving ? <><LoaderCircle size={18} className="animate-spin" />{pendingCreate ? "確認中…" : "保存中…"}</> : pendingCreate ? "保存結果を確認する" : editing ? "更新する" : "作成する"}
        </Button>
      </FormModalFooter>
    </div>
  );
}

/** 予定の編集・削除（権限保持者向け）。予定カード内に表示 */
export function ScheduleManageActions({ schedule }: { schedule: PracticeSchedule }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);

  async function remove() {
    try {
      const { data, error } = await createClient().from("practice_schedules").delete().eq("id", schedule.id).select("id");
      if (error || !data || data.length !== 1) {
        showToast("予定を削除できませんでした");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      showToast("予定を削除できませんでした");
      return false;
    }
  }

  return (
    <>
      <ActionMenu
        onEdit={() => setEditOpen(true)}
        onDelete={remove}
        deleteTitle="予定を削除しますか？"
        deleteDescription="予定に紐づく出欠と練習メニューも削除されます。"
        triggerLabel="予定のメニュー"
      />
      {editOpen && (
        <FormModal open onOpenChange={setEditOpen} title="予定を編集">
          <ScheduleForm schedule={schedule} onDone={() => setEditOpen(false)} />
        </FormModal>
      )}
    </>
  );
}
