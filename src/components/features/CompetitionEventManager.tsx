"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormDraftGuard, FormModal, FormModalFooter, useFormDraft } from "@/components/ui/form-modal";
import { Input } from "@/components/ui/input";
import { ReorderList } from "@/components/ui/reorder-list";
import { useToast } from "@/components/ui/toast";
import {
  RECORD_FORMAT_LABEL,
  isRecordFormat,
  fromRecordFormat,
  recordFormatOf,
  type RecordFormat,
} from "@/lib/competition-record";
import type { CompetitionEvent } from "@/lib/competition-goals";

const selectClass =
  "w-full rounded-xl border border-separator bg-card p-3 text-base";

/**
 * 種目マスタの管理（システム管理者のみ）。
 * 結果と目標はここに登録された種目から選ぶ。「その他」で入力された種目名は
 * 未登録として並び、マスタへ追加するか、登録済みの種目へまとめて統一できる。
 */
export function CompetitionEventManager({
  initial,
  unregistered,
}: {
  initial: CompetitionEvent[];
  /** 結果に入力されていてマスタに無い種目名と、その件数 */
  unregistered: { name: string; count: number }[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [items, setItems] = useState(initial);
  const [pending, setPending] = useState(unregistered);
  const [editing, setEditing] = useState<CompetitionEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [merging, setMerging] = useState<{ name: string; count: number } | null>(
    null,
  );
  const [mergeTo, setMergeTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [catalogToCheck, setCatalogToCheck] = useState<CompetitionEvent | null>(null);
  const [catalogRetryAllowed, setCatalogRetryAllowed] = useState(false);

  /** ドラッグした順に 10 刻みで振り直す（数字を手で入れなくてよいように） */
  async function reorder(next: CompetitionEvent[]) {
    if (busy || reviewRequired) return;
    const previous = items;
    const renumbered = next.map((e, index) => ({ ...e, sort_order: (index + 1) * 10 }));
    setBusy(true);
    setItems(renumbered);
    const supabase = createClient();
    const results = await Promise.allSettled(renumbered.map(async (event) =>
      supabase.from("competition_events")
        .update({ sort_order: event.sort_order })
        .eq("name", event.name)
        .select("name"),
    ));
    setBusy(false);
    if (results.some(result => result.status === "rejected" || result.value.error || result.value.data?.length !== 1)) {
      setItems(previous);
      setReviewRequired(true);
      setOperationError("並び順をすべて保存できたか確認できませんでした。画面を再読み込みして確認してください");
      router.refresh();
      return;
    }
    router.refresh();
  }

  async function remove(event: CompetitionEvent) {
    if (busy || reviewRequired) return false;
    try {
      const { data, error } = await createClient()
        .from("competition_events")
        .delete()
        .eq("name", event.name)
        .select("name");
      if (error || !data || data.length !== 1) {
        showToast(error?.code === "23503" ? "目標が登録されている種目は削除できません" : "種目を削除できませんでした");
        return false;
      }
      setItems((old) => old.filter((e) => e.name !== event.name));
      router.refresh();
      return true;
    } catch {
      showToast("種目を削除できませんでした");
      return false;
    }
  }

  async function addToCatalog(name: string) {
    if (busy || reviewRequired) return;
    setBusy(true);
    const submitted: CompetitionEvent = { name, sort_order: Math.max(0, ...items.map((e) => e.sort_order)) + 10, measure_type: "time", time_format: "minutes" };
    try {
      const { data, error } = await createClient()
        .from("competition_events")
        .insert(submitted)
        .select("name,sort_order,measure_type,time_format")
        .single();
      if (error || !data) {
        if (!error?.code) {
          setCatalogToCheck(submitted);
          setReviewRequired(true);
          setOperationError("種目を追加できたか確認できませんでした。保存結果を確認してください");
        } else showToast("種目を追加できませんでした");
        return;
      }
      setItems((old) => [...old, data as CompetitionEvent]);
      setPending((old) => old.filter((e) => e.name !== name));
      showToast("種目を追加しました。記録の測り方を確認してください", "success");
      router.refresh();
    } catch {
      setCatalogToCheck(submitted);
      setReviewRequired(true);
      setOperationError("種目を追加できたか確認できませんでした。保存結果を確認してください");
    } finally {
      setBusy(false);
    }
  }

  async function checkCatalogSave() {
    if (!catalogToCheck || busy) return;
    setBusy(true);
    setCatalogRetryAllowed(false);
    try {
      const { data, error } = await createClient().from("competition_events")
        .select("name,sort_order,measure_type,time_format").eq("name", catalogToCheck.name).maybeSingle();
      if (!error && !data) {
        setCatalogRetryAllowed(true);
        setOperationError("保存結果を確認できませんでした。同じ内容で保存を試すこともできます");
        return;
      }
      if (error || !data || !Object.entries(catalogToCheck).every(([key, value]) => data[key as keyof CompetitionEvent] === value)) {
        setOperationError("保存結果を確認できませんでした。時間をおいてもう一度確認してください");
        return;
      }
      setItems((old) => [...old.filter(event => event.name !== data.name), data]);
      setPending((old) => old.filter(event => event.name !== data.name));
      setCatalogToCheck(null);
      setReviewRequired(false);
      setOperationError(null);
      router.refresh();
    } catch {
      setOperationError("保存結果を確認できませんでした。時間をおいてもう一度確認してください");
    } finally { setBusy(false); }
  }

  async function retryCatalogSave() {
    if (busy || !catalogRetryAllowed || !catalogToCheck) return;
    setBusy(true);
    setCatalogRetryAllowed(false);
    try {
      const { data, error } = await createClient().from("competition_events")
        .insert(catalogToCheck).select("name,sort_order,measure_type,time_format").single();
      if (error || !data) {
        setOperationError("保存結果を確認できませんでした。もう一度保存結果を確認してください");
        return;
      }
      setItems((old) => [...old.filter(event => event.name !== data.name), data]);
      setPending((old) => old.filter(event => event.name !== data.name));
      setCatalogToCheck(null);
      setReviewRequired(false);
      setOperationError(null);
      router.refresh();
    } catch {
      setOperationError("保存結果を確認できませんでした。もう一度保存結果を確認してください");
    } finally { setBusy(false); }
  }

  async function mergeInto(from: string, to: string, expected: number) {
    if (busy || reviewRequired || !to) return;
    setBusy(true);
    setOperationError(null);
    let writing = false;
    try {
      const supabase = createClient();
      const { count, error: countError } = await supabase.from("pb_records")
        .select("id", { count: "exact", head: true }).eq("event_name", from);
      if (countError || count === null) {
        setOperationError("記録の件数を確認できませんでした。もう一度お試しください");
        return;
      }
      if (count !== expected || expected === 0) {
        setReviewRequired(true);
        setOperationError("記録の件数が変わっています。画面を再読み込みして確認してください");
        return;
      }
      writing = true;
      const { data, error } = await supabase.from("pb_records")
        .update({ event_name: to }).eq("event_name", from).select("id");
      if (error || !data || data.length !== expected) {
        setReviewRequired(true);
        setOperationError("種目名をすべて変更できたか確認できませんでした。画面を再読み込みして確認してください");
        router.refresh();
        return;
      }
      setPending((old) => old.filter((e) => e.name !== from));
      setMerging(null);
      setMergeTo("");
      showToast(`${data.length}件の記録を「${to}」に統一しました`, "success");
      router.refresh();
    } catch {
      setReviewRequired(writing);
      setOperationError(writing
        ? "種目名を変更できたか確認できませんでした。画面を再読み込みして確認してください"
        : "記録の件数を確認できませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="text-caption">
        ここに登録した種目が、結果と目標の選択肢になります。種目名を変えると、登録済みの結果と目標の表記もまとめて変わります。
      </p>
      {!merging && operationError && <p role="alert" className="text-caption text-danger">{operationError}</p>}
      {!merging && reviewRequired && (catalogToCheck
        ? <div className="space-y-2"><Button variant="outline" disabled={busy} onClick={() => void checkCatalogSave()}>保存結果を確認</Button>{catalogRetryAllowed && <Button disabled={busy} onClick={() => void retryCatalogSave()}>同じ内容で保存する</Button>}</div>
        : <Button variant="outline" onClick={() => window.location.reload()}>画面を再読み込み</Button>)}

      {pending.length > 0 && (
        <section className="space-y-2">
          <p className="section-label">未登録の種目（その他で入力されたもの）</p>
          {pending.map((e) => (
            <Card key={e.name} className="space-y-2 p-3">
              <p className="text-headline break-words">
                {e.name}
                <span className="ml-1.5 text-caption">{e.count}件</span>
              </p>
              <div data-ui-group className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || reviewRequired}
                  onClick={() => void addToCatalog(e.name)}
                >
                  種目に追加
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || reviewRequired || items.length === 0}
                  onClick={() => {
                    setMerging(e);
                    setMergeTo("");
                  }}
                >
                  既存の種目にまとめる
                </Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="section-label">登録済みの種目</p>
          <Button
            type="button"
            size="sm"
            variant={reorderMode ? "primary" : "outline"}
            disabled={busy || reviewRequired || items.length < 2}
            onClick={() => setReorderMode((value) => !value)}
          >
            <SlidersHorizontal size={16} />
            {reorderMode ? "完了" : "並べ替え"}
          </Button>
        </div>
        <ReorderList
          items={items.map((e) => ({ ...e, id: e.name }))}
          enabled={reorderMode && !busy && !reviewRequired}
          onReorder={(next) =>
            void reorder(
              next.map(({ name, sort_order, measure_type, time_format }) => ({
                name,
                sort_order,
                measure_type,
                time_format,
              })),
            )
          }
          renderItem={(e) => (
            <Card key={e.name} className="p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-headline break-words">{e.name}</p>
                  <p className="text-caption">
                    {RECORD_FORMAT_LABEL[recordFormatOf([e], e.name)]}
                  </p>
                </div>
                {!reorderMode && (
                  <ActionMenu
                    disabled={busy || reviewRequired}
                    onEdit={() => setEditing(e)}
                    onDelete={() => remove(e)}
                    deleteTitle={`「${e.name}」を削除しますか？`}
                    deleteDescription="目標が登録されている種目は削除できません。"
                    triggerLabel={`${e.name}のメニュー`}
                  />
                )}
              </div>
            </Card>
          )}
        />
      </section>

      <Button
        variant="outline"
        size="lg"
        disabled={busy || reviewRequired}
        onClick={() => setCreating(true)}
        className="gap-2"
      >
        <Plus size={18} /> 種目を追加
      </Button>

      {(creating || editing) && (
        <FormModal
          open
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false);
              setEditing(null);
            }
          }}
          title={editing ? "種目を編集" : "種目を追加"}
        >
          <EventForm
            event={editing ?? undefined}
            sortOrder={
              editing?.sort_order ??
              Math.max(0, ...items.map((e) => e.sort_order)) + 10
            }
            onSaved={(saved, previousName) => {
              setItems((old) => [
                ...old.filter((e) => e.name !== previousName),
                saved,
              ]);
              setCreating(false);
              setEditing(null);
              router.refresh();
            }}
          />
        </FormModal>
      )}

      {merging && (
        <FormModal
          open
          onOpenChange={(open) => !open && setMerging(null)}
          title="種目をまとめる"
        >
          {operationError && <p role="alert" className="mb-3 text-caption text-danger">{operationError}</p>}
          {reviewRequired && <Button variant="outline" className="mb-3" onClick={() => window.location.reload()}>画面を再読み込み</Button>}
          <fieldset disabled={busy || reviewRequired} className="min-w-0 space-y-4 pb-4">
            <FormDraftGuard dirty={!!mergeTo && !reviewRequired} busy={busy} onSave={() => mergeInto(merging.name, mergeTo, merging.count)} />
            <p className="text-body">
              「{merging.name}」で入力された{merging.count}
              件の結果を、選んだ種目に付け替えます。
            </p>
            <select
              data-ui-field
              aria-label="まとめ先の種目"
              className={selectClass}
              value={mergeTo}
              onChange={(e) => setMergeTo(e.target.value)}
            >
              <option value="">種目を選択</option>
              {items.map((e) => (
                <option key={e.name}>{e.name}</option>
              ))}
            </select>
            <FormModalFooter>
              <Button
                size="lg"
                disabled={busy || reviewRequired || !mergeTo}
                onClick={() => void mergeInto(merging.name, mergeTo, merging.count)}
              >
                {busy ? "変更中…" : "この種目にまとめる"}
              </Button>
            </FormModalFooter>
          </fieldset>
        </FormModal>
      )}
    </>
  );
}

function EventForm({
  event,
  sortOrder,
  onSaved,
}: {
  event?: CompetitionEvent;
  sortOrder: number;
  onSaved: (saved: CompetitionEvent, previousName?: string) => void;
}) {
  const [name, setName] = useState(event?.name ?? "");
  const sort = sortOrder;
  const [format, setFormat] = useState<RecordFormat>(
    event ? recordFormatOf([event], event.name) : "minutes",
  );
  const [saving, setSaving] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState<CompetitionEvent | null>(null);
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useFormDraft({
    dirty: !!unconfirmed || name !== (event?.name ?? "") || format !== (event ? recordFormatOf([event], event.name) : "minutes"),
    busy: saving,
    intent: unconfirmed ? "check" : undefined,
    onSave: unconfirmed ? checkSave : submit,
  });

  async function checkSave() {
    if (saving || !unconfirmed) return;
    setSaving(true);
    setRetryAllowed(false);
    try {
      const { data, error: readError } = await createClient().from("competition_events")
        .select("name,sort_order,measure_type,time_format").eq("name", unconfirmed.name).maybeSingle();
      if (!readError && data && Object.entries(unconfirmed).every(([key, value]) => data[key as keyof CompetitionEvent] === value)) {
        onSaved(data, event?.name);
        return;
      }
      if (!readError) {
        let original = data;
        let originalReadFailed = false;
        if (!data && event && event.name !== unconfirmed.name) {
          const result = await createClient().from("competition_events")
            .select("name,sort_order,measure_type,time_format").eq("name", event.name).maybeSingle();
          original = result.data;
          originalReadFailed = !!result.error;
        }
        if (!originalReadFailed && (!original ? !event : !!event && Object.keys(unconfirmed).every(key => original![key as keyof CompetitionEvent] === event[key as keyof CompetitionEvent]))) {
          setRetryAllowed(true);
          setError("保存結果を確認できませんでした。同じ内容で保存を試すこともできます");
          return;
        }
      }
      setError("保存結果を確認できませんでした。時間をおいてもう一度確認してください");
    } catch {
      setError("保存結果を確認できませんでした。時間をおいてもう一度確認してください");
    } finally { setSaving(false); }
  }
  async function retrySave() {
    if (saving || !retryAllowed || !unconfirmed) return;
    setSaving(true);
    setRetryAllowed(false);
    try {
      const supabase = createClient();
      let query = event ? supabase.from("competition_events").update(unconfirmed).eq("name", event.name) : supabase.from("competition_events").insert(unconfirmed);
      if (event) {
        for (const key of Object.keys(unconfirmed)) {
          const value = event[key as keyof CompetitionEvent];
          if (value === undefined) { setError("変更前の内容を確認できませんでした。もう一度保存結果を確認してください"); return; }
          query = value === null ? query.is(key, null) : query.eq(key, value);
        }
      }
      const { data, error: saveError } = await query.select("name,sort_order,measure_type,time_format").single();
      if (saveError || !data) {
        setError("保存結果を確認できませんでした。もう一度保存結果を確認してください");
        return;
      }
      onSaved(data, event?.name);
    } catch {
      setError("保存結果を確認できませんでした。もう一度保存結果を確認してください");
    } finally { setSaving(false); }
  }

  async function submit() {
    if (saving || unconfirmed) return;
    if (!name.trim()) {
      setError("種目名を入力してください");
      return;
    }
    setSaving(true);
    setError(null);
    const payload: CompetitionEvent = { name: name.trim(), sort_order: sort, ...fromRecordFormat(format) };
    try {
      const supabase = createClient();
      const { data, error: saveError } = event
        ? await supabase
            .from("competition_events")
            .update(payload)
            .eq("name", event.name)
            .select("name,sort_order,measure_type,time_format")
            .single()
        : await supabase
            .from("competition_events")
            .insert(payload)
            .select("name,sort_order,measure_type,time_format")
            .single();
      if (saveError || !data) {
        if (!saveError?.code) {
          setUnconfirmed(payload);
          setError("保存できたか確認できませんでした。保存結果を確認してください");
        } else setError("保存できませんでした。もう一度お試しください");
        return;
      }
      onSaved(data as CompetitionEvent, event?.name);
    } catch {
      setUnconfirmed(payload);
      setError("保存できたか確認できませんでした。保存結果を確認してください");
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset disabled={saving || !!unconfirmed} className="min-w-0 space-y-4 pb-4">
      <div>
        <p className="section-label mb-1.5">種目名</p>
        <Input
          maxLength={50}
          placeholder="例: 5000m"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <p className="section-label mb-1.5">記録の書き方</p>
        <select
          data-ui-field
          aria-label="記録の書き方"
          className={selectClass}
          value={format}
          onChange={(e) =>
            setFormat(isRecordFormat(e.target.value) ? e.target.value : "minutes")
          }
        >
          {(Object.keys(RECORD_FORMAT_LABEL) as RecordFormat[]).map((key) => (
            <option key={key} value={key}>
              {RECORD_FORMAT_LABEL[key]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-caption">
          結果の入力欄がこの設定で切り替わります。並び順は一覧の「並べ替え」から変えられます。
        </p>
      </div>
      {error && <p className="text-caption text-danger text-center">{error}</p>}
      <FormModalFooter>
        {unconfirmed
          ? <div className="space-y-2"><Button size="lg" disabled={saving} onClick={() => void checkSave()}>保存結果を確認</Button>{retryAllowed && <Button size="lg" disabled={saving} onClick={() => void retrySave()}>同じ内容で保存する</Button>}</div>
          : <Button size="lg" onClick={submit} disabled={saving}>
              {saving ? "保存中…" : event ? "更新する" : "追加する"}
            </Button>}
      </FormModalFooter>
    </fieldset>
  );
}
