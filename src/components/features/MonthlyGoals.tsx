"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormModal, FormModalFooter, FormDraftGuard } from "@/components/ui/form-modal";
import type { MonthlyGoal } from "@/lib/queries";

/**
 * 月ごとの目標と振り返り（目標ページ）。本人だけが読み書きする。
 * 行を押すと、その月の目標と振り返りを一緒に編集する。
 */
export function MonthlyGoals({
  userId,
  thisMonth,
  goals: initialGoals,
}: {
  userId: string;
  /** YYYY-MM（JST） */
  thisMonth: string;
  goals: MonthlyGoal[];
}) {
  const router = useRouter();
  const [goals, setGoals] = useState(initialGoals);
  const [editing, setEditing] = useState<MonthlyGoal | null>(null);
  const [goal, setGoal] = useState("");
  const [reflection, setReflection] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(row: MonthlyGoal) {
    setEditing(row);
    setGoal(row.goal ?? "");
    setReflection(row.reflection ?? "");
    setError(null);
  }

  const dirty = !!editing && (goal !== (editing.goal ?? "") || reflection !== (editing.reflection ?? ""));

  async function save() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    const values = { goal: goal.trim() || null, reflection: reflection.trim() || null };
    try {
      const { data, error: saveError } = await createClient()
        .from("monthly_goals")
        .upsert(
          { user_id: userId, month: `${editing.month}-01`, ...values, updated_at: new Date().toISOString() },
          { onConflict: "user_id,month" },
        )
        .select("month");
      if (saveError || data?.length !== 1) {
        setError("保存できませんでした。画面を開き直してから、もう一度お試しください");
        return;
      }
      setGoals((rows) => rows.map((row) => (row.month === editing.month ? { ...row, ...values } : row)));
      setEditing(null);
      router.refresh();
    } catch {
      setError("保存できませんでした。もう一度お試しください");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="divide-y divide-separator/70">
        {goals.map((row) => (
          <button
            key={row.month}
            type="button"
            data-ui-row
            onClick={() => open(row)}
            className="flex w-full items-start gap-3 p-4 text-left active:bg-bg"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-headline">
                {monthLabel(row.month)}
                {row.month === thisMonth && <span className="ml-2 text-caption text-accent">今月</span>}
              </p>
              <p className={`whitespace-pre-wrap break-words text-body ${row.goal ? "" : "text-muted"}`}>
                {row.goal ?? (row.month < thisMonth ? "目標なし" : "目標を設定")}
              </p>
              {row.reflection ? (
                <p className="whitespace-pre-wrap break-words text-caption">
                  <span className="font-semibold">振り返り: </span>{row.reflection}
                </p>
              ) : row.month <= thisMonth && (
                <p className="text-caption text-muted">振り返りを書く</p>
              )}
            </div>
            <ChevronRight size={18} className="mt-0.5 shrink-0 text-muted" />
          </button>
        ))}
      </div>

      <FormModal
        open={!!editing}
        onOpenChange={(next) => { if (!next) setEditing(null); }}
        title={editing ? `${monthLabel(editing.month)}の目標` : "目標"}
        autoFocus={false}
      >
        <FormDraftGuard dirty={dirty} busy={saving} onSave={save} />
        <fieldset disabled={saving} className="min-w-0 space-y-4 pb-4">
          <div>
            <label htmlFor="monthly-goal" className="section-label mb-1.5 block">目標</label>
            <Textarea
              id="monthly-goal"
              rows={3}
              placeholder="例: 週4回走る / 1500m 4分10秒"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              maxLength={300}
            />
          </div>
          <div>
            <label htmlFor="monthly-reflection" className="section-label mb-1.5 block">振り返り</label>
            <Textarea
              id="monthly-reflection"
              aria-describedby="monthly-reflection-help"
              rows={4}
              placeholder="例: 練習は続けられた。後半のペースが課題"
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              maxLength={1000}
            />
            <p id="monthly-reflection-help" className="text-micro mt-1">月ごとの目標と振り返りは自分だけに表示されます。</p>
          </div>
          {error && <p className="text-caption text-danger text-center">{error}</p>}
          <FormModalFooter>
            <Button size="lg" onClick={save} disabled={saving}>
              {saving ? "保存中…" : "保存する"}
            </Button>
          </FormModalFooter>
        </fieldset>
      </FormModal>
    </>
  );
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${year}年${monthNumber}月`;
}
