"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormDraftGuard, FormModal, FormModalFooter } from "@/components/ui/form-modal";
import { Textarea } from "@/components/ui/textarea";
import { atomicSave, atomicSaveMessage } from "@/lib/atomic-save";
import { findMiddleLongMenuRow, type MiddleLongMenuSnapshot } from "@/lib/middle-long-menu-data";
import type { PracticeMenu } from "@/types";

type Fields = { content: string; pace: string; remark: string; supplement: string };
type Attempt = { values: Fields; uncertain: boolean; confirmed: boolean };

export function SheetMenuEditModal({ menu, scheduleId, onOpenChange, onSaved }: {
  menu: PracticeMenu;
  scheduleId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (menu: PracticeMenu) => void;
}) {
  const [fields, setFields] = useState<Fields>({
    content: menu.content ?? "", pace: menu.pace ?? "", remark: menu.remark ?? "", supplement: menu.supplement ?? "",
  });
  const [initial] = useState(() => JSON.stringify(fields));
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<Attempt | null>(null);
  const lock = useRef(false);

  async function save() {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError(null);
    const current = attempt.current ?? {
      values: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.trim()])) as Fields,
      uncertain: false, confirmed: false,
    };
    attempt.current = current;
    try {
      if (!current.confirmed) {
        const result = await atomicSave(current, async () => {
          const response = await fetch("/api/middle-long-menus", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduleId, ...current.values }),
          });
          if (response.ok) return { data: true, error: null };
          // These statuses are rejected before the external sheet write starts.
          if ([400, 401, 403, 404].includes(response.status)) return { data: null, error: { code: "23514" } };
          return { data: null, error: null };
        }, async () => {
          const date = /^sheet-middle-long:(\d{4}-\d{2}-\d{2})$/.exec(menu.id)?.[1];
          if (!date) return null;
          const month = Number(date.slice(5, 7));
          const response = await fetch(`/api/middle-long-menus?months=${month}`, { cache: "no-store" });
          if (!response.ok) return null;
          const snapshot = await response.json() as MiddleLongMenuSnapshot;
          if (!Array.isArray(snapshot.loadedMonths) || !snapshot.loadedMonths.includes(month) || !Array.isArray(snapshot.rows)) return null;
          const row = findMiddleLongMenuRow(snapshot.rows, date);
          // The CSV parser omits completely empty rows; a loaded month still proves the fields are empty.
          return Object.entries(current.values).every(([key, value]) => (row?.[key as keyof Fields] ?? "") === value) ? true : null;
        });
        if (!result.ok) {
          setPending(result.reason === "unknown");
          if (result.reason !== "unknown") attempt.current = null;
          setError(result.reason === "invalid" ? "保存できませんでした。入力内容と編集権限を確認してください。" : atomicSaveMessage(result.reason));
          return;
        }
        current.confirmed = true;
      }
      setPending(true);
      onSaved({ ...menu, ...current.values, pace: current.values.pace || null, remark: current.values.remark || null,
        supplement: current.values.supplement || null, updated_at: new Date().toISOString() });
      onOpenChange(false);
    } catch {
      setPending(true);
      setError(current.confirmed
        ? "保存しましたが、画面を更新できませんでした。もう一度押すと画面だけ更新します。"
        : "保存結果を確認できませんでした。もう一度押すと結果だけ確認します。");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return <FormModal open onOpenChange={onOpenChange} title="中長距離メニューを編集">
    <FormDraftGuard dirty={pending || JSON.stringify(fields) !== initial} busy={saving} onSave={save} intent={pending ? "check" : "update"} />
    <fieldset disabled={saving || pending} className="min-w-0 space-y-4 pb-4">
      <p className="rounded-xl bg-accent/5 px-3 py-2 text-xs text-muted">保存すると月別スプレッドシートへ書き込まれます。</p>
      {([["content", "メニュー"], ["pace", "ペース"], ["remark", "補足"], ["supplement", "補強"]] as const).map(([key, label]) =>
        <div key={key}><p className="section-label mb-1.5">{label}</p>
          <Textarea aria-label={label} autoGrow rows={key === "content" ? 4 : 2} value={fields[key]}
            onChange={event => setFields(current => ({ ...current, [key]: event.target.value }))} />
        </div>)}
    </fieldset>
    {error && <p className="text-center text-caption text-danger">{error}</p>}
    <FormModalFooter><Button size="lg" onClick={() => void save()} disabled={saving}>
      {saving ? "確認・保存中…" : pending ? "保存結果を確認" : "更新する"}
    </Button></FormModalFooter>
  </FormModal>;
}
