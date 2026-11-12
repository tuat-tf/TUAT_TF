"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionMenu } from "@/components/ui/action-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { FormModal, FormModalFooter, FormDraftGuard } from "@/components/ui/form-modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { festivalStockLevel, formatFestivalTime } from "@/lib/festival";
import type { FestivalStockEvent, FestivalStockItem } from "@/lib/queries";
import { FestivalSaveButton, SAVE_ERROR } from "./shared";

const HISTORY_SHOWN = 5;

/**
 * 部室にある材料の残り。使うたびに「1つ使った」で減らしていく。
 * 足し引きはDB側で行うので、2人が同時に押しても数がずれない。
 * 変更は記録に残り、「使った」は売上と同じように1件ずつ取り消せる。
 */
export function FestivalStock({ items, events, userId }: { items: FestivalStockItem[]; events: FestivalStockEvent[]; userId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  // 押した直後の数。読み直した一覧が届いたら捨てて、DBの数に合わせる。
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(items);
  if (loaded !== items) {
    setLoaded(items);
    setCounts({});
  }
  const [form, setForm] = useState<{ target: FestivalStockItem | null } | null>(null);
  const [name, setName] = useState("");
  const [count, setCount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [undoing, setUndoing] = useState<FestivalStockEvent | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);

  const remainingOf = (item: FestivalStockItem) => counts[item.id] ?? item.count;

  async function undo() {
    if (!undoing) return;
    setUndoBusy(true);
    try {
      const { data, error: undoError } = await createClient().rpc("festival_undo_stock_event", { p_event_id: undoing.id });
      if (undoError || typeof data !== "number") {
        showToast("取り消せませんでした");
        return;
      }
      setCounts((current) => ({ ...current, [undoing.item_id]: data }));
      setUndoing(null);
    } catch {
      showToast("取り消せませんでした");
    } finally {
      setUndoBusy(false);
      router.refresh();
    }
  }

  function open(target: FestivalStockItem | null) {
    setForm({ target });
    setName(target?.name ?? "");
    setCount(target ? String(remainingOf(target)) : "");
    setError(null);
  }

  async function adjust(item: FestivalStockItem, delta: number) {
    try {
      const { data, error: adjustError } = await createClient().rpc("festival_adjust_stock", { p_item_id: item.id, p_delta: delta });
      if (adjustError || typeof data !== "number") {
        showToast("数を変えられませんでした");
        return;
      }
      setCounts((current) => ({ ...current, [item.id]: data }));
    } catch {
      showToast("数を変えられませんでした");
    } finally {
      router.refresh();
    }
  }

  const parsedCount = /^\d{1,4}$/.test(count.trim()) ? Number(count.trim()) : null;

  async function save() {
    if (!form || !name.trim() || parsedCount === null) return;
    setSaving(true);
    setError(null);
    try {
      const table = createClient().from("festival_stock_items");
      // 編集で残りを書き換えたとき（数え直し・補充）は、その数を新しい「用意した数」にする。
      const recount = !form.target || parsedCount !== remainingOf(form.target);
      const values = {
        name: name.trim(),
        count: parsedCount,
        ...(recount ? { initial_count: parsedCount } : {}),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      };
      const { data, error: saveError } = form.target
        ? await table.update(values).eq("id", form.target.id).select("id")
        : await table.insert(values).select("id");
      if (saveError || data?.length !== 1) return setError(SAVE_ERROR);
      setForm(null);
      router.refresh();
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: FestivalStockItem) {
    try {
      const { data, error: removeError } = await createClient().from("festival_stock_items").delete().eq("id", item.id).select("id");
      if (removeError || data?.length !== 1) {
        showToast("削除できませんでした");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      showToast("削除できませんでした");
      return false;
    }
  }

  const dirty = !!form && (name !== (form.target?.name ?? "") || count !== (form.target ? String(form.target.count) : ""));

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <Card><EmptyState title="まだ材料はありません" description="「材料セット」など、残りを数えたいものを足してください。" /></Card>
      ) : items.map((item) => {
        const remaining = remainingOf(item);
        const level = festivalStockLevel(remaining, item.initial_count);
        return (
          <Card key={item.id} className="space-y-3 p-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="break-words text-headline">{item.name}</p>
                <p className="mt-1 flex items-baseline gap-1.5 tabular-nums">
                  <span className="text-caption">残り</span>
                  <span className={cn("text-[34px] font-bold leading-none", level.state === "ok" ? "text-ink" : "text-danger")} aria-label={`${item.name}の残り`}>{remaining}</span>
                  <span className="text-caption">/ {Math.max(item.initial_count, remaining)}</span>
                  <span className={cn("ml-1 text-caption font-semibold text-danger", level.state === "ok" && "invisible")}>{level.state === "empty" ? "なくなりました" : "残りわずか"}</span>
                </p>
              </div>
              <ActionMenu onEdit={() => open(item)} editLabel="数え直す・補充する" onDelete={() => remove(item)} deleteTitle={`「${item.name}」を削除しますか？`} triggerLabel={`${item.name}のメニュー`} />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-separator/60" aria-hidden="true">
              <div className={cn("h-full rounded-full transition-[width] duration-200", level.state === "ok" ? "bg-accent" : "bg-danger")} style={{ width: `${level.percent}%` }} />
            </div>
            <Button className="h-12 w-full" disabled={remaining <= 0} onClick={() => adjust(item, -1)}>1つ使った</Button>
            <StockHistory events={events.filter((event) => event.item_id === item.id)} onUndo={setUndoing} />
          </Card>
        );
      })}

      <Button size="lg" variant="secondary" onClick={() => open(null)}><Plus size={18} />材料を足す</Button>
      <p className="text-micro px-1">使うたびに「1つ使った」を押します。押し間違えたら、記録の「取り消す」を押してください。買い足したときは「…」から数を入れ直します。</p>

      <ConfirmDialog
        open={!!undoing}
        onOpenChange={(next) => { if (!next && !undoBusy) setUndoing(null); }}
        title="この記録を取り消しますか？"
        description={undoing ? `${formatFestivalTime(undoing.created_at)} ${-undoing.delta}つ使った。残りが${-undoing.delta}つ戻ります。` : ""}
        confirmLabel="取り消す"
        busyLabel="取り消し中…"
        busy={undoBusy}
        onConfirm={undo}
      />

      <FormModal open={!!form} onOpenChange={(next) => { if (!next) setForm(null); }} title={form?.target ? "材料を編集" : "材料"}>
        <FormDraftGuard dirty={dirty} busy={saving} onSave={save} />
        <fieldset disabled={saving} className="min-w-0 space-y-4 pb-4">
          <div>
            <label htmlFor="festival-stock-name" className="section-label mb-1.5 block">名前</label>
            <Input id="festival-stock-name" placeholder="例: 材料セット" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
          </div>
          <div>
            <label htmlFor="festival-stock-count" className="section-label mb-1.5 block">{form?.target ? "いまある数" : "用意した数"}</label>
            <Input id="festival-stock-count" aria-describedby="festival-stock-count-help" inputMode="numeric" placeholder="例: 30" value={count} onChange={(event) => setCount(event.target.value)} maxLength={4} />
            <p id="festival-stock-count-help" className="text-micro mt-1">ここから使うたびに1つずつ減らしていきます。</p>
          </div>
          {error && <p className="text-caption text-danger text-center">{error}</p>}
          <FormModalFooter>
            <FestivalSaveButton saving={saving} editing={!!form?.target} disabled={!name.trim() || parsedCount === null} onClick={save} />
          </FormModalFooter>
        </fieldset>
      </FormModal>
    </div>
  );
}

/**
 * 材料ごとの変更の記録（新しい順）。「使った」は取り消せる。
 * 数え直した記録より前の「使った」は、数え直しに含まれているので取り消せない（DB側も同じ）。
 */
function StockHistory({ events, onUndo }: { events: FestivalStockEvent[]; onUndo: (event: FestivalStockEvent) => void }) {
  if (events.length === 0) return null;
  const lastSet = events.find((event) => event.kind === "set");
  const undoable = (event: FestivalStockEvent) => event.kind === "use" && (!lastSet || event.created_at > lastSet.created_at);
  const row = (event: FestivalStockEvent) => (
    <div key={event.id} className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] tabular-nums">
          {event.kind === "use" ? <>{-event.delta}つ使った<span className="text-muted">（残り{event.count_after}）</span></> : `残りを${event.count_after}にした`}
        </p>
        <p className="truncate text-micro text-muted tabular-nums">{formatFestivalTime(event.created_at)}・{event.actor?.display_name ?? "退部した部員"}</p>
      </div>
      {undoable(event) && <Button size="sm" variant="ghost" className="text-danger" onClick={() => onUndo(event)}>取り消す</Button>}
    </div>
  );
  const shown = events.slice(0, HISTORY_SHOWN);
  const rest = events.slice(HISTORY_SHOWN);
  return (
    <div className="border-t border-separator/70 pt-2">
      <p className="text-micro font-semibold text-muted">記録</p>
      <div className="divide-y divide-separator/50">{shown.map(row)}</div>
      {rest.length > 0 && (
        <Disclosure title={`前の記録（${rest.length}件）`}>
          <div className="divide-y divide-separator/50">{rest.map(row)}</div>
        </Disclosure>
      )}
    </div>
  );
}
