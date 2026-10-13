"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Minus, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { attendanceNote, nextAttendance, saveAttendance, type AttendanceChange, type AttendancePending } from "@/lib/attendance-save";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AttendanceStatusOrNone } from "@/types";

export type { AttendanceChange } from "@/lib/attendance-save";
const STYLE = {
  none: { label: "出欠を入力", cls: "bg-accent/10 text-accent border-accent border-dashed", icon: Minus },
  present: { label: "出席", cls: "bg-success text-white border-success", icon: Check },
  absent: { label: "欠席", cls: "bg-danger text-white border-danger", icon: X },
};

/** Attendance and contact share one in-flight request, so neither can erase the other's pending save. */
export function AttendanceToggle({ scheduleId, attendDate, userId, initial, initialLate = false, initialLateNote = null, initialAbsenceNote = null, refreshOnChange = false, onChanged }: {
  scheduleId: string; attendDate: string; userId: string; initial: AttendanceStatusOrNone;
  initialLate?: boolean; initialLateNote?: string | null; initialAbsenceNote?: string | null;
  refreshOnChange?: boolean; onChanged?: (change: AttendanceChange) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState<AttendanceChange>({ status: initial, isLate: initialLate, lateNote: initialLateNote, absenceNote: initialAbsenceNote });
  const [note, setNote] = useState(initial === "absent" ? initialAbsenceNote ?? "" : initialLateNote ?? "");
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AttendancePending | null>(null);
  const sending = useRef(false);
  async function save(after: AttendanceChange, closeSheet = false) {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(null);
    pending.current ??= { before: value, after, uncertain: false };
    try {
      const result = await saveAttendance(createClient(), { scheduleId, attendDate, userId }, pending.current);
      if (!result.ok) {
        setUnknown(result.reason === "unknown");
        if (result.reason !== "unknown") pending.current = null;
        setError(result.reason === "unknown" ? "保存結果を確認できませんでした。入力は残っています。結果を確認してください" : result.reason === "conflict" ? "出欠や連絡が変更されています。画面を開き直して確認してください" : "保存できませんでした。入力は残っています。もう一度お試しください");
        return;
      }
      setValue(result.value); setUnknown(false); pending.current = null; setConfirmClear(false);
      // A direct late toggle must not discard an unfinished note in the closed editor.
      if (closeSheet || result.value.status === "none") { setNote(attendanceNote(result.value) ?? ""); setOpen(false); }
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
  return <div className="min-w-0 space-y-2" onClick={event => event.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-1" data-attendance-controls>
      <button type="button" data-system-glass data-glass-control data-glass-attendance={value.status}
        aria-label={style.label}
        aria-busy={busy} disabled={busy || unknown} onClick={toggleAttendance}
        className={cn("inline-flex h-11 w-16 shrink-0 items-center justify-center gap-1 rounded-full border px-1 text-[13px] font-semibold whitespace-nowrap pressable disabled:opacity-60", style.cls)}>
        {busy ? <LoaderCircle size={15} className="animate-spin" /> : value.status !== "none" ? <Icon size={15} /> : null}{value.status === "none" ? "未回答" : style.label}
      </button>
      {value.status === "present" && <Button variant={value.isLate ? "secondary" : "ghost"} size="sm" className="h-11 min-w-14 px-1" style={{ paddingInline: 4 }} disabled={busy || unknown} aria-pressed={value.isLate} aria-label={value.isLate ? "遅刻を取り消す" : "遅刻を連絡"}
        onClick={() => void save({ ...value, isLate: !value.isLate })}>{value.isLate ? "遅刻中" : "遅刻"}</Button>}
      {value.status !== "none" && <Button variant={savedNote ? "secondary" : "ghost"} size="sm" className="h-11 min-w-11 px-1" style={{ paddingInline: 4 }} disabled={busy || unknown} aria-haspopup="dialog" aria-label={savedNote ? "連絡を編集" : "連絡する"} onClick={() => setOpen(true)}>連絡</Button>}
    </div>
    {savedNote && <p className="whitespace-pre-wrap break-words text-caption">{savedNote}</p>}
    {unknown && <Button variant="outline" size="sm" disabled={busy} onClick={() => void save(value, open)}>保存結果を確認</Button>}
    {error && !open && <p role="alert" className="text-caption text-danger">{error}</p>}
    <Sheet open={open} onOpenChange={next => { if (!sending.current) setOpen(next); }}>
      <SheetContent title="出欠の連絡" swipeToClose={false}>
        <fieldset disabled={busy || unknown} className="space-y-2">
          <label htmlFor={`attendance-contact-${scheduleId}-${attendDate}`} className="block text-body">連絡事項（任意）</label>
          <Input id={`attendance-contact-${scheduleId}-${attendDate}`} value={note} onChange={event => setNote(event.target.value)} maxLength={60} placeholder="例: 練習の途中で早退します" />
          <p className="text-caption">出欠一覧を開いた部員に表示されます。</p>
        </fieldset>
        {error && <p role="alert" className="mt-3 text-caption text-danger">{error}</p>}
        <Button size="lg" className="mt-4" disabled={busy || (!unknown && (note.trim() || null) === savedNote)} onClick={() => void save(value.status === "absent" ? { ...value, absenceNote: note.trim() || null } : { ...value, lateNote: note.trim() || null }, true)}>
          {busy ? "保存中…" : unknown ? "保存結果を確認" : "保存する"}
        </Button>
      </SheetContent>
    </Sheet>
    <ConfirmDialog open={confirmClear} onOpenChange={next => { if (!sending.current) setConfirmClear(next); }} title="出欠と連絡を取り消しますか？" description={`この日の出欠と連絡事項を取り消し、未回答に戻します。${error ? ` ${error}` : ""}`} confirmLabel={unknown ? "保存結果を確認" : "取り消す"} busyLabel="保存中…" busy={busy} onConfirm={() => void save(nextAttendance(value))} />
  </div>;
}
