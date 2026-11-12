"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { Disclosure } from "@/components/ui/disclosure";
import { ActionMenu } from "@/components/ui/action-menu";
import { FormModal, FormModalFooter, FormDraftGuard } from "@/components/ui/form-modal";
import { useToast } from "@/components/ui/toast";
import { Linkify } from "@/components/common/Linkify";
import { formatFestivalTime } from "@/lib/festival";
import type { FestivalTrip } from "@/lib/queries";
import { FestivalSaveButton, SAVE_ERROR, useFestivalShare } from "./shared";

const STATUS_LABEL: Record<FestivalTrip["status"], string> = { open: "募集中", going: "買い出し中", done: "完了" };

/** 買い出しの募集。行ける人が「行きます」を押し、出発・完了で状況を変える。 */
export function FestivalShopping({ trips, userId }: { trips: FestivalTrip[]; userId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const share = useFestivalShare();
  const [form, setForm] = useState<{ target: FestivalTrip | null } | null>(null);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const active = trips.filter((trip) => trip.status !== "done");
  const done = trips.filter((trip) => trip.status === "done");

  function open(target: FestivalTrip | null) {
    setForm({ target });
    setTitle(target?.title ?? "");
    setNote(target?.note ?? "");
    setError(null);
  }

  async function save() {
    if (!form || !title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const table = createClient().from("festival_shopping_trips");
      const values = { title: title.trim(), note: note.trim() || null };
      const { data, error: saveError } = form.target
        ? await table.update({ ...values, updated_at: new Date().toISOString() }).eq("id", form.target.id).select("id")
        : await table.insert({ ...values, created_by: userId }).select("id");
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

  const toggleJoin = (trip: FestivalTrip, joined: boolean) => run(trip.id, () => {
    const table = createClient().from("festival_shopping_members");
    return joined
      ? table.delete().eq("trip_id", trip.id).eq("user_id", userId).select("trip_id")
      : table.insert({ trip_id: trip.id, user_id: userId }).select("trip_id");
  }, "保存できませんでした");
  const setStatus = (trip: FestivalTrip, status: FestivalTrip["status"]) => run(trip.id, () => createClient()
    .from("festival_shopping_trips").update({ status, updated_at: new Date().toISOString() }).eq("id", trip.id).select("id"), "変更できませんでした");
  const remove = (trip: FestivalTrip) => run(trip.id, () => createClient()
    .from("festival_shopping_trips").delete().eq("id", trip.id).select("id"), "削除できませんでした");

  const memberNames = (trip: FestivalTrip) => trip.members.map((member) => member.profile?.display_name ?? "退部した部員").join("、");

  return (
    <div className="space-y-3">
      <Button size="lg" onClick={() => open(null)}><Plus size={18} />買い出しを募集する</Button>

      {active.length === 0 ? (
        <Card><EmptyState title="まだ買い出しはありません" description="足りないものがあれば募集してください。" /></Card>
      ) : active.map((trip) => {
        const joined = trip.members.some((member) => member.user_id === userId);
        const names = memberNames(trip);
        return (
          <Card key={trip.id} className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Badge className={trip.status === "going" ? "bg-accent/10 text-accent" : undefined}>{STATUS_LABEL[trip.status]}</Badge>
                <p className="break-words text-[17px] font-semibold leading-snug">{trip.title}</p>
              </div>
              <ActionMenu onEdit={() => open(trip)} onDelete={() => remove(trip)} deleteTitle="この買い出しを削除しますか？" triggerLabel="買い出しのメニュー" />
            </div>
            {trip.note && <p className="whitespace-pre-wrap break-words text-body"><Linkify text={trip.note} /></p>}
            <p className="text-caption">
              <span className="font-semibold tabular-nums">行く人 {trip.members.length}人</span>
              {names && <span className="text-muted">: {names}</span>}
            </p>
            <p className="text-micro text-muted">{trip.creator?.display_name ?? "退部した部員"}・{formatFestivalTime(trip.created_at)}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={joined ? "outline" : "primary"} className="min-w-[124px]" disabled={busy === trip.id} onClick={() => toggleJoin(trip, joined)}>
                {joined ? "行くのをやめる" : "行きます"}
              </Button>
              <Button size="sm" variant="secondary" className="min-w-[92px]" disabled={busy === trip.id} onClick={() => setStatus(trip, trip.status === "open" ? "going" : "done")}>
                {trip.status === "open" ? "出発する" : "完了にする"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => share(["【学祭・買い出し募集】", trip.title, trip.note, "行ける人はアプリで「行きます」を押してください"])}>
                <Share2 size={15} />LINEなどで共有
              </Button>
            </div>
          </Card>
        );
      })}

      {done.length > 0 && (
        <Disclosure title={`完了した買い出し（${done.length}件）`}>
          <div className="divide-y divide-separator/70">
            {done.map((trip) => (
              <div key={trip.id} className="flex items-start gap-2 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="break-words text-body">{trip.title}</p>
                  <p className="text-caption">{formatFestivalTime(trip.created_at)}・{memberNames(trip) || "行った人の登録なし"}</p>
                </div>
                <Button size="sm" variant="ghost" disabled={busy === trip.id} onClick={() => setStatus(trip, "open")}>戻す</Button>
                <ActionMenu onDelete={() => remove(trip)} deleteTitle="この買い出しを削除しますか？" triggerLabel="買い出しのメニュー" />
              </div>
            ))}
          </div>
        </Disclosure>
      )}

      <FormModal open={!!form} onOpenChange={(next) => { if (!next) setForm(null); }} title={form?.target ? "買い出しを編集" : "買い出し"}>
        <FormDraftGuard dirty={!!form && (title !== (form.target?.title ?? "") || note !== (form.target?.note ?? ""))} busy={saving} onSave={save} />
        <fieldset disabled={saving} className="min-w-0 space-y-4 pb-4">
          <div>
            <label htmlFor="festival-trip-title" className="section-label mb-1.5 block">買うもの</label>
            <Input id="festival-trip-title" placeholder="例: 油2本、紙コップ100個" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
          </div>
          <div>
            <label htmlFor="festival-trip-note" className="section-label mb-1.5 block">メモ（任意）</label>
            <Textarea id="festival-trip-note" rows={3} placeholder="例: 15時までに。2人ほしい。レシートを店長へ" value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} />
          </div>
          {error && <p className="text-caption text-danger text-center">{error}</p>}
          <FormModalFooter>
            <FestivalSaveButton saving={saving} editing={!!form?.target} disabled={!title.trim()} onClick={save} />
          </FormModalFooter>
        </fieldset>
      </FormModal>
    </div>
  );
}
