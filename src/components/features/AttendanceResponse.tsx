"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
export function AttendanceToggle({ scheduleId, attendDate, userId, initial, initialLate = false, initialLateNote = null, initialAbsenceNote = null, refreshOnChange = false, summary, onChanged }: {
  scheduleId: string; attendDate: string; userId: string; initial: AttendanceStatusOrNone;
  initialLate?: boolean; initialLateNote?: string | null; initialAbsenceNote?: string | null;
  summary?: ReactNode; refreshOnChange?: boolean; onChanged?: (change: AttendanceChange) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState<AttendanceChange>({ status: initial, isLate: initialLate, lateNote: initialLateNote, absenceNote: initialAbsenceNote });
  const [note, setNote] = useState(initial === "absent" ? initialAbsenceNote ?? "" : initialLateNote ?? "");
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactSaved, setContactSaved] = useState(false);
  const pending = useRef<AttendancePending | null>(null);
  const pendingContact = useRef(false);
  const sending = useRef(false);
  async function save(after: AttendanceChange, saveContact = false) {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(null); setContactSaved(false);
    if (!pending.current) {
      pending.current = { before: value, after, uncertain: false };
      pendingContact.current = saveContact;
    }
    try {
      const result = await saveAttendance(createClient(), { scheduleId, attendDate, userId }, pending.current);
      if (!result.ok) {
        setUnknown(result.reason === "unknown");
        if (result.reason !== "unknown") pending.current = null;
        setError(result.reason === "unknown" ? "保存結果を確認できませんでした。入力は残っています。結果を確認してください" : result.reason === "conflict" ? "出欠や連絡が変更されています。画面を開き直して確認してください" : "保存できませんでした。入力は残っています。もう一度お試しください");
        return;
      }
      const savedContact = pendingContact.current;
      setValue(result.value); setUnknown(false); pending.current = null; setConfirmClear(false);
      // Checking a lateness save must not replace an unfinished contact note.
      if (savedContact || result.value.status === "none") setNote(attendanceNote(result.value) ?? "");
      if (result.value.status === "none") setOpen(false);
      if (savedContact) setContactSaved(true);
      onChanged?.(result.value);
      if (refreshOnChange) router.refresh();
    } catch {
      const uncertain = pending.current?.uncertain ?? false;
      setUnknown(uncertain);
      if (!uncertain) pending.current = null;
      setError(uncertain ? "保存結果を確認できませんでした。入力は残っています" : "保存できませんでした。入力は残っています。もう一度お試しください");
    } finally { sending.current = false; setBusy(false); }
  }
  function toggleAttendance() {
    const next = nextAttendance(value);
    if (next.status === "none" && (attendanceNote(value) || note.trim())) { setConfirmClear(true); return; }
    void save(next);
  }
  const style = STYLE[value.status], Icon = style.icon;
  const savedNote = attendanceNote(value);
  const contactId = `attendance-contact-${scheduleId}-${attendDate}`;
  return <div className="min-w-0 space-y-2" onClick={event => event.stopPropagation()}>
    <div className="grid grid-cols-2 gap-2" data-attendance-controls>
      <button type="button" data-system-glass data-glass-control data-glass-attendance={value.status}
        aria-label={style.label}
        aria-busy={busy} disabled={busy || unknown} onClick={toggleAttendance}
        className={cn("inline-flex items-center justify-center border font-semibold whitespace-nowrap pressable disabled:opacity-60", CONTROL_CLASS, style.cls)}>
        {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Icon size={15} />}{style.label}
      </button>
      {summary}
      {value.status === "present" && <Button variant={value.isLate ? "secondary" : "outline"} size="sm" className={CONTROL_CLASS} style={CONTROL_STYLE} disabled={busy || unknown} aria-pressed={value.isLate} aria-label={value.isLate ? "遅刻を取り消す" : "遅刻を連絡"}
        onClick={() => void save({ ...value, isLate: !value.isLate })}><Clock3 size={15} />{value.isLate ? "遅刻連絡済み" : "遅刻を連絡"}</Button>}
      {value.status !== "none" && <Button variant="ghost" size="sm" className={cn(CONTROL_CLASS, value.status === "absent" && !!summary && "col-span-2")} style={CONTROL_STYLE} disabled={busy || unknown} aria-expanded={open} aria-controls={contactId} aria-label={savedNote ? "連絡を編集" : "連絡する"} onClick={() => { if (!sending.current) setOpen(current => !current); }}><MessageSquare size={15} />{savedNote ? "連絡を編集" : "連絡する"}</Button>}
    </div>
    {!open && savedNote && <p className="whitespace-pre-wrap break-words text-caption">{savedNote}</p>}
    {unknown && !open && <Button variant="outline" size="sm" className={CONTROL_CLASS} style={CONTROL_STYLE} disabled={busy} onClick={() => void save(value)}>保存結果を確認</Button>}
    {error && !open && <p role="alert" className="text-caption text-danger">{error}</p>}
    {open && <div id={contactId} className="space-y-2">
        <fieldset disabled={busy || unknown} className="space-y-2">
          <label htmlFor={`${contactId}-input`} className="block text-caption">連絡事項（任意）</label>
          <Input id={`${contactId}-input`} className="h-11 lg:h-11 lg:text-base" value={note} onChange={event => { setNote(event.target.value); setContactSaved(false); }} maxLength={60} placeholder="例: 練習の途中で早退します" />
        </fieldset>
        <div className="grid grid-cols-2 items-center gap-2">
        <Button variant="outline" size="sm" className={CONTROL_CLASS} style={CONTROL_STYLE} disabled={busy || (!unknown && (note.trim() || null) === savedNote)} onClick={() => void save(value.status === "absent" ? { ...value, absenceNote: note.trim() || null } : { ...value, lateNote: note.trim() || null }, true)}>
          {busy ? "保存中…" : unknown ? "保存結果を確認" : "保存する"}
        </Button>
        <p role="status" className="min-h-5 text-caption">{contactSaved ? "保存しました" : ""}</p>
        </div>
        {error && <p role="alert" className="text-caption text-danger">{error}</p>}
    </div>}
    <ConfirmDialog open={confirmClear} onOpenChange={next => { if (!sending.current) setConfirmClear(next); }} title="出欠と連絡を取り消しますか？" description={`この日の出欠と連絡事項を取り消し、未回答に戻します。${error ? ` ${error}` : ""}`} confirmLabel={unknown ? "保存結果を確認" : "取り消す"} busyLabel="保存中…" busy={busy} onConfirm={() => void save(nextAttendance(value))} />
  </div>;
}
