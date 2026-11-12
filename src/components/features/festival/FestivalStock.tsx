"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionMenu } from "@/components/ui/action-menu";
import { FormModal, FormModalFooter, FormDraftGuard } from "@/components/ui/form-modal";
import { useToast } from "@/components/ui/toast";
import { formatFestivalTime } from "@/lib/festival";
import type { FestivalStockItem } from "@/lib/queries";
import { FestivalSaveButton, SAVE_ERROR } from "./shared";

/** 部室にある材料の数。＋−はDB側で足し引きするので、2人が同時に押しても数がずれない。 */
export function FestivalStock({ items, userId }: { items: FestivalStockItem[]; userId: string }) {
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
  const [count, setCount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(target: FestivalStockItem | null) {
    setForm({ target });
    setName(target?.name ?? "");
    setCount(String(target ? (counts[target.id] ?? target.count) : 0));
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
      const values = { name: name.trim(), count: parsedCount, updated_by: userId, updated_at: new Date().toISOString() };
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

  const dirty = !!form && (name !== (form.target?.name ?? "") || count !== String(form.target?.count ?? 0));

  return (
    <div className="space-y-3">
      <Button size="lg" onClick={() => open(null)}><Plus size={18} />材料を足す</Button>

      {items.length === 0 ? (
        <Card><EmptyState title="まだ材料はありません" description="「材料セット」など、数えたいものを足してください。" /></Card>
      ) : (
        <Card className="divide-y divide-separator/70 overflow-hidden">
          {items.map((item) => {
            const value = counts[item.id] ?? item.count;
            return (
              <div key={item.id} className="flex items-center gap-2 py-3 pl-4 pr-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-headline">{item.name}</p>
                  <p className="truncate text-micro text-muted tabular-nums">{formatFestivalTime(item.updated_at)}{item.updater ? `・${item.updater.display_name}` : ""}</p>
                </div>
                <Button size="icon" variant="outline" aria-label={`${item.name}を1つ減らす`} disabled={value <= 0} onClick={() => adjust(item, -1)}><Minus size={18} /></Button>
                <p className="w-14 text-center text-[22px] font-bold tabular-nums" aria-label={`${item.name}の数`}>{value}</p>
                <Button size="icon" variant="outline" aria-label={`${item.name}を1つ増やす`} disabled={value >= 9999} onClick={() => adjust(item, 1)}><Plus size={18} /></Button>
                <ActionMenu onEdit={() => open(item)} onDelete={() => remove(item)} deleteTitle={`「${item.name}」を削除しますか？`} triggerLabel={`${item.name}のメニュー`} />
              </div>
            );
          })}
        </Card>
      )}
      <p className="text-micro px-1">使ったら−、買い足したら＋を押します。まとめて直すときは「…」から編集できます。</p>

      <FormModal open={!!form} onOpenChange={(next) => { if (!next) setForm(null); }} title={form?.target ? "材料を編集" : "材料"}>
        <FormDraftGuard dirty={dirty} busy={saving} onSave={save} />
        <fieldset disabled={saving} className="min-w-0 space-y-4 pb-4">
          <div>
            <label htmlFor="festival-stock-name" className="section-label mb-1.5 block">名前</label>
            <Input id="festival-stock-name" placeholder="例: 材料セット" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} />
          </div>
          <div>
            <label htmlFor="festival-stock-count" className="section-label mb-1.5 block">数</label>
            <Input id="festival-stock-count" inputMode="numeric" placeholder="0" value={count} onChange={(event) => setCount(event.target.value)} maxLength={4} />
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
