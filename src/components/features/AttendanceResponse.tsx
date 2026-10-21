"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, X, Minus, LoaderCircle, Clock3, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { attendanceNote, nextAttendance, saveAttendance, type AttendanceChange, type AttendancePending } from "@/lib/attendance-save";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AttendanceStatusOrNone } from "@/types";

export type { AttendanceChange } from "@/lib/attendance-save";
const STYLE = {
  none: { label: "出欠を入力", cls: "bg-accent/10 text-accent border-accent border-dashed", icon: Minus },
  present: { label: "出席", cls: "bg-success text-white border-success", icon: Check },
  absent: { label: "欠席", cls: "bg-danger text-white border-danger", icon: X },
};
const CONTROL_CLASS = "h-11 min-h-11 w-full min-w-0 gap-1 rounded-full px-2 text-[13px] lg:h-11 lg:px-2 lg:text-[13px]";
const CONTROL_STYLE = { paddingInline: 8 };

/** Attendance and contact share one in-flight request, so neither can erase the other's pending save. */
export function AttendanceToggle({ scheduleId, attendDate, userId, initial, initialLate = false, initialLateNote = null, initialAbsenceNote = null, summary, onChanged }: {
  scheduleId: string; attendDate: string; userId: string; initial: AttendanceStatusOrNone;
  initialLate?: boolean; initialLateNote?: string | null; initialAbsenceNote?: string | null;
  summary?: ReactNode; onChanged?: (change: AttendanceChange) => void;
}) {
  const [value, setValue] = useState<AttendanceChange>({ status: initial, isLate: initialLate, lateNote: initialLateNote, absenceNote: initialAbsenceNote });
  const [note, setNote] = useState(initial === "absent" ? initialAbsenceNote ?? "" : initialLateNote ?? "");
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [saving, setSaving] = useState<"attendance" | "late" | "contact" | null>(null);
  const busy = saving !== null;
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactSaved, setContactSaved] = useState(false);
  const pending = useRef<AttendancePending | null>(null);
  const pendingContact = useRef(false);
  const sending = useRef(false);
  const currentValue = useRef(value);
  const displayedValue = useRef(value);
  const queuedAttendance = useRef<AttendanceChange | null>(null);
  const draft = useRef(note);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const blocked = useRef(false);
  const pendingKind = useRef<"attendance" | "late" | "contact">("attendance");
  function display(next: AttendanceChange) {
    displayedValue.current = next;
    setValue(next);
    onChanged?.(next);
  }
  function restoreConfirmed() {
    queuedAttendance.current = null;
    display(currentValue.current);
  }
  function clearTimer() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function flushContact() {
    clearTimer();
    if (blocked.current || composing.current) return;
    if (sending.current) return;
    const current = currentValue.current, text = draft.current.trim() || null;
    if (current.status === "none" || text === attendanceNote(current)) return;
    void save(current.status === "absent" ? { ...current, absenceNote: text } : { ...current, lateNote: text }, "contact");
  }
  function changeNote(text: string) {
    draft.current = text; setNote(text); setContactSaved(false);
    clearTimer();
    if (!blocked.current && !composing.current) timer.current = setTimeout(flushContact, 700);
  }
  useEffect(() => () => {
    // Navigation may unmount the card before the debounce expires.
    flushContact();
    // The cleanup reads the latest draft and confirmed value from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(after: AttendanceChange, kind: "attendance" | "late" | "contact" = "attendance") {
    if (sending.current) {
      if (kind === "attendance") {
        queuedAttendance.current = after;
        display(after);
      }
      return;
    }
    sending.current = true; setError(null); setContactSaved(false);
    if (!pending.current) {
      pending.current = { before: currentValue.current, after, uncertain: false };
      pendingContact.current = kind === "contact";
      pendingKind.current = kind;
      if (kind === "attendance") display(after);
    }
    setSaving(pendingKind.current);
    let succeeded = false;
    try {
      const result = await saveAttendance(createClient(), { scheduleId, attendDate, userId }, pending.current);
      if (!result.ok) {
        blocked.current = true; clearTimer();
        setUnknown(result.reason === "unknown");
        if (result.reason !== "unknown") pending.current = null;
        restoreConfirmed();
        setError(result.reason === "unknown" ? "保存結果を確認できませんでした。入力は残っています。結果を確認してください" : result.reason === "conflict" ? "出欠や連絡が変更されています。画面を開き直して確認してください" : "保存できませんでした。入力は残っています。もう一度お試しください");
        return;
      }
      const savedContact = pendingContact.current;
      currentValue.current = result.value; blocked.current = false; succeeded = true;
      if (!queuedAttendance.current) display(result.value);
      setUnknown(false); pending.current = null;
      if (result.value.status === "none") setConfirmClear(false);
      // An older response must not replace text typed while it was in flight.
      if (!queuedAttendance.current && (result.value.status === "none" || (savedContact && (draft.current.trim() || null) === attendanceNote(result.value)))) {
        draft.current = attendanceNote(result.value) ?? ""; setNote(draft.current);
      }
      if (!queuedAttendance.current && result.value.status === "none") setOpen(false);
      if (savedContact && (draft.current.trim() || null) === attendanceNote(result.value)) setContactSaved(true);
    } catch {
      blocked.current = true; clearTimer();
      const uncertain = pending.current?.uncertain ?? false;
      setUnknown(uncertain);
      if (!uncertain) pending.current = null;
      restoreConfirmed();
      setError(uncertain ? "保存結果を確認できませんでした。入力は残っています" : "保存できませんでした。入力は残っています。もう一度お試しください");
    } finally {
      sending.current = false; setSaving(null);
      if (succeeded) {
        const next = queuedAttendance.current;
        queuedAttendance.current = null;
        if (next && (next.status !== currentValue.current.status || next.isLate !== currentValue.current.isLate || next.lateNote !== currentValue.current.lateNote || next.absenceNote !== currentValue.current.absenceNote)) {
          void save(next);
        } else if (!timer.current) flushContact();
      }
    }
  }
  function toggleAttendance() {
    const current = displayedValue.current;
    const withDraft = current.status === "absent" ? { ...current, absenceNote: draft.current.trim() || null } : { ...current, lateNote: draft.current.trim() || null };
    const next = nextAttendance(withDraft);
    if (next.status === "none" && (attendanceNote(current) || draft.current.trim())) { setConfirmClear(true); return; }
    if (current.status === "none") { draft.current = ""; setNote(""); }
    void save(next);
  }
  const style = STYLE[value.status], Icon = style.icon;
  const savedNote = attendanceNote(value);
  const contactId = `attendance-contact-${scheduleId}-${attendDate}`;
  return <div className="min-w-0 space-y-2" onClick={event => event.stopPropagation()}>
    <div className={cn("grid gap-2", summary ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2.75rem]" : "grid-cols-[minmax(0,1fr)_2.75rem]")} data-attendance-controls>
      <button type="button" data-system-glass data-glass-control data-glass-attendance={value.status}
        aria-label={style.label}
        aria-busy={saving === "attendance"} disabled={unknown} onClick={toggleAttendance}
        className={cn("inline-flex items-center justify-center border font-semibold whitespace-nowrap pressable disabled:opacity-60", CONTROL_CLASS, style.cls)}>
        <Icon size={15} />{style.label}
      </button>
      {summary}
      <Button variant="ghost" size="sm" className={cn(CONTROL_CLASS, value.isLate && "text-accent")} style={CONTROL_STYLE} disabled={value.status === "none" || busy || unknown} aria-expanded={open} aria-controls={contactId} aria-label={savedNote ? "連絡を編集" : "連絡する"} title="遅刻・連絡" onClick={() => { if (!sending.current) setOpen(current => !current); }}>{value.isLate ? <Clock3 size={18} /> : <MessageSquare size={18} />}</Button>
    </div>
    {!open && savedNote && <p className="whitespace-pre-wrap break-words text-caption">{savedNote}</p>}
    {unknown && !open && <Button variant="outline" size="sm" className={CONTROL_CLASS} style={CONTROL_STYLE} disabled={busy} onClick={() => void save(value)}>保存結果を確認</Button>}
    {error && !open && <p role="alert" className="text-caption text-danger">{error}</p>}
    {open && <div id={contactId} className="space-y-2">
        {value.status === "present" && <Button variant={value.isLate ? "secondary" : "outline"} size="sm" className={CONTROL_CLASS} style={CONTROL_STYLE} disabled={busy || unknown} aria-busy={saving === "late"} aria-pressed={value.isLate} aria-label={value.isLate ? "遅刻を取り消す" : "遅刻を連絡"}
          onClick={() => void save({ ...currentValue.current, isLate: !currentValue.current.isLate }, "late")}>{saving === "late" ? <LoaderCircle size={15} className="animate-spin" /> : <Clock3 size={15} />}{value.isLate ? "遅刻" : "遅刻を連絡"}</Button>}
        <fieldset disabled={unknown} className="space-y-2">
          <label htmlFor={`${contactId}-input`} className="block text-caption">連絡事項（任意）</label>
          <Input id={`${contactId}-input`} className="h-11 lg:h-11 lg:text-base" value={note} onChange={event => changeNote(event.target.value)} onBlur={flushContact}
            onCompositionStart={() => { composing.current = true; clearTimer(); }} onCompositionEnd={event => { composing.current = false; changeNote(event.currentTarget.value); }}
            maxLength={60} placeholder="例: 練習の途中で早退します" />
        </fieldset>
        <div className="grid grid-cols-2 items-center gap-2">
        <p role="status" className="col-span-2 min-h-5 text-caption">{saving === "contact" ? "保存中…" : contactSaved ? "保存しました" : error ? "" : "自動で保存します"}</p>
        {error && (unknown || pendingKind.current === "contact") && <Button variant="outline" size="sm" className={CONTROL_CLASS} style={CONTROL_STYLE} disabled={busy} onClick={() => {
          if (unknown) void save(currentValue.current);
          else { blocked.current = false; flushContact(); }
        }}>{unknown ? "保存結果を確認" : "もう一度保存する"}</Button>}
        </div>
        {error && <p role="alert" className="text-caption text-danger">{error}</p>}
    </div>}
    <ConfirmDialog open={confirmClear} onOpenChange={next => { if (!sending.current) setConfirmClear(next); }} title="出欠と連絡を取り消しますか？" description={`この日の出欠と連絡事項を取り消し、未回答に戻します。${error ? ` ${error}` : ""}`} confirmLabel={unknown ? "保存結果を確認" : "取り消す"} busyLabel="保存中…" busy={busy} onConfirm={() => void save(nextAttendance(value))} />
  </div>;
}
