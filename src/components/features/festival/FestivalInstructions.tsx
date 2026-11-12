"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionMenu } from "@/components/ui/action-menu";
import { FormModal, FormModalFooter, FormDraftGuard } from "@/components/ui/form-modal";
import { useToast } from "@/components/ui/toast";
import { Linkify } from "@/components/common/Linkify";
import { formatFestivalTime } from "@/lib/festival";
import type { FestivalInstruction } from "@/lib/queries";
import { FestivalSaveButton, SAVE_ERROR, useFestivalShare } from "./shared";

/**
 * 店長からの指示。いま有効な指示を上に並べ、読んだ人が「確認しました」を押す。
 * 通知はLINEに任せる（共有ボタンで文面を渡す）。ここは「いま何が有効で、誰が読んだか」を残す場所。
 */
export function FestivalInstructions({ instructions, userId }: { instructions: FestivalInstruction[]; userId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const share = useFestivalShare();
  const [form, setForm] = useState<{ target: FestivalInstruction | null } | null>(null);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const current = instructions.filter((row) => !row.closed_at);
  const closed = instructions.filter((row) => row.closed_at);

  function open(target: FestivalInstruction | null) {
    setForm({ target });
    setBody(target?.body ?? "");
    setError(null);
  }

  async function save() {
    if (!form || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const table = createClient().from("festival_instructions");
      const { data, error: saveError } = form.target
        ? await table.update({ body: body.trim() }).eq("id", form.target.id).select("id")
        : await table.insert({ body: body.trim(), author_id: userId }).select("id");
      if (saveError || data?.length !== 1) return setError(SAVE_ERROR);
      setForm(null);
      router.refresh();
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setSaving(false);
    }
  }

  /** 1件だけ変わったことを確かめてから画面を読み直す */
  async function run(id: string, action: () => PromiseLike<{ data: unknown[] | null; error: unknown }>, failure: string) {
    setBusy(id);
    try {
      const { data, error: actionError } = await action();
      if (actionError || data?.length !== 1) {
        showToast(failure);
        return false;
      }
      router.refresh();
      return true;
    } catch {
      showToast(failure);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const toggleAck = (row: FestivalInstruction, acked: boolean) => run(row.id, () => {
    const table = createClient().from("festival_instruction_acks");
    return acked
      ? table.delete().eq("instruction_id", row.id).eq("user_id", userId).select("instruction_id")
      : table.insert({ instruction_id: row.id, user_id: userId }).select("instruction_id");
  }, "確認を保存できませんでした");
  const setClosed = (row: FestivalInstruction, isClosed: boolean) => run(row.id, () => createClient()
    .from("festival_instructions").update({ closed_at: isClosed ? new Date().toISOString() : null }).eq("id", row.id).select("id"), "変更できませんでした");
  const remove = (row: FestivalInstruction) => run(row.id, () => createClient()
    .from("festival_instructions").delete().eq("id", row.id).select("id"), "削除できませんでした");

  return (
    <div className="space-y-3">
      <Button size="lg" onClick={() => open(null)}><Plus size={18} />指示を出す</Button>

      {current.length === 0 ? (
        <Card><EmptyState title="まだ指示はありません" description="店長からの指示がここに並びます。" /></Card>
      ) : current.map((row) => {
        const acked = row.acks.some((ack) => ack.user_id === userId);
        const names = row.acks.map((ack) => ack.profile?.display_name ?? "退部した部員").join("、");
        return (
          <Card key={row.id} className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[17px] font-semibold leading-relaxed"><Linkify text={row.body} /></p>
              <ActionMenu
                onEdit={() => open(row)}
                onDelete={() => remove(row)}
                deleteTitle="この指示を削除しますか？"
                triggerLabel="指示のメニュー"
              />
            </div>
            <p className="text-caption">{row.author?.display_name ?? "退部した部員"}・{formatFestivalTime(row.created_at)}</p>
            <p className="text-caption">
              <span className="font-semibold tabular-nums">確認 {row.acks.length}人</span>
              {names && <span className="text-muted">: {names}</span>}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={acked ? "outline" : "primary"} className="min-w-[116px]" disabled={busy === row.id} onClick={() => toggleAck(row, acked)}>
                <Check size={15} />{acked ? "確認済み" : "確認しました"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => share(["【学祭・店長より】", row.body, "読んだらアプリで「確認しました」を押してください"])}>
                <Share2 size={15} />LINEなどで共有
              </Button>
              <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => setClosed(row, true)}>終了にする</Button>
            </div>
          </Card>
        );
      })}

      {closed.length > 0 && (
        <Disclosure title={`終了した指示（${closed.length}件）`}>
          <div className="divide-y divide-separator/70">
            {closed.map((row) => (
              <div key={row.id} className="flex items-start gap-2 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="whitespace-pre-wrap break-words text-body">{row.body}</p>
                  <p className="text-caption">{row.author?.display_name ?? "退部した部員"}・{formatFestivalTime(row.created_at)}・確認 {row.acks.length}人</p>
                </div>
                <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => setClosed(row, false)}>戻す</Button>
                <ActionMenu onDelete={() => remove(row)} deleteTitle="この指示を削除しますか？" triggerLabel="指示のメニュー" />
              </div>
            ))}
          </div>
        </Disclosure>
      )}

      <FormModal open={!!form} onOpenChange={(next) => { if (!next) setForm(null); }} title={form?.target ? "指示を編集" : "指示"}>
        <FormDraftGuard dirty={!!form && body !== (form.target?.body ?? "")} busy={saving} onSave={save} />
        <fieldset disabled={saving} className="min-w-0 space-y-4 pb-4">
          <div>
            <label htmlFor="festival-instruction" className="section-label mb-1.5 block">内容</label>
            <Textarea
              id="festival-instruction"
              aria-describedby="festival-instruction-help"
              rows={5}
              placeholder="例: 13時から揚げる人を1人増やします。手が空いた人はテントへ"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={500}
            />
            <p id="festival-instruction-help" className="text-micro mt-1">1件に1つの用件を書くと、誰が確認したかが分かりやすくなります。</p>
          </div>
          {error && <p className="text-caption text-danger text-center">{error}</p>}
          <FormModalFooter>
            <FestivalSaveButton saving={saving} editing={!!form?.target} disabled={!body.trim()} onClick={save} />
          </FormModalFooter>
        </fieldset>
      </FormModal>
    </div>
  );
}
