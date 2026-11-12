"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { jstToday } from "@/lib/date";
import { cn } from "@/lib/utils";
import {
  FESTIVAL_MAX_QUANTITY, festivalContainer, festivalPrice, formatFestivalTime, formatYen, summarizeFestivalSales,
  type FestivalTotals,
} from "@/lib/festival";
import type { FestivalSale } from "@/lib/queries";

/** よく出る個数（大きく並べる）と、それ以上（「11個以上」を開いたときだけ出す） */
const COMMON_QUANTITIES = Array.from({ length: 10 }, (_, index) => index + 1);
const MORE_QUANTITIES = Array.from({ length: FESTIVAL_MAX_QUANTITY - 10 }, (_, index) => index + 11);
const RECENT_COUNT = 10;

/**
 * 売上。個数を押すと価格と容器が出るので、確かめてから保存する（押し間違いをそのまま入れない）。
 * 今日の売上・日ごとの集計は店長だけに出す。ほかの人に届く売上は直近1時間の分だけ（RLS）。
 */
export function FestivalSales({ sales, userId, manager }: { sales: FestivalSale[]; userId: string; manager: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [quantity, setQuantity] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<FestivalSale | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const days = useMemo(() => summarizeFestivalSales(sales), [sales]);
  const todayKey = jstToday();
  const today = days.find((day) => day.day === todayKey);

  async function save() {
    if (quantity === null || saving) return;
    const amount = festivalPrice(quantity);
    setSaving(true);
    try {
      const { data, error } = await createClient()
        .from("festival_sales")
        .insert({ quantity, amount, recorded_by: userId })
        .select("id");
      if (error || data?.length !== 1) {
        showToast("売上を保存できませんでした");
        return;
      }
      showToast(`${quantity}個 ${formatYen(amount)} を保存しました`, "success");
      setQuantity(null);
      setShowMore(false);
    } catch {
      // 届いたかどうか分からないので、もう一度押す前に一覧で確かめてもらう。
      showToast("保存できたか分かりません。下の一覧を確かめてください");
    } finally {
      setSaving(false);
      router.refresh();
    }
  }

  async function remove() {
    if (!removing) return;
    setRemoveBusy(true);
    try {
      const { data, error } = await createClient().from("festival_sales").delete().eq("id", removing.id).select("id");
      if (error || data?.length !== 1) {
        showToast("売上を取り消せませんでした");
        return;
      }
      setRemoving(null);
      router.refresh();
    } catch {
      showToast("売上を取り消せませんでした");
    } finally {
      setRemoveBusy(false);
    }
  }

  const container = quantity === null ? null : festivalContainer(quantity);

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="section-label">個数を選ぶ</p>
        <div className="grid grid-cols-5 gap-2">
          {COMMON_QUANTITIES.map((value) => (
            <QuantityButton key={value} value={value} active={value === quantity} large onSelect={setQuantity} />
          ))}
        </div>
        {showMore || (quantity !== null && quantity > 10) ? (
          <div className="grid grid-cols-5 gap-2">
            {MORE_QUANTITIES.map((value) => (
              <QuantityButton key={value} value={value} active={value === quantity} onSelect={setQuantity} />
            ))}
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowMore(true)}>11個以上</Button>
        )}
        <Card className="flex min-h-[72px] items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            {quantity === null || !container ? (
              <p className="text-caption">個数を押すと、価格と容器が出ます。</p>
            ) : (
              <>
                <p className="tabular-nums leading-tight"><span className="text-[17px] font-semibold">{quantity}個</span> <span className="text-[26px] font-bold">{formatYen(festivalPrice(quantity))}</span></p>
                <p className="text-caption">容器: {container.label}</p>
              </>
            )}
          </div>
          <Button className="min-w-[112px]" disabled={quantity === null || saving} onClick={save}>
            {saving && <LoaderCircle size={18} className="animate-spin" />}
            {saving ? "保存中…" : "保存する"}
          </Button>
        </Card>
      </section>

      {manager && (
        <section className="space-y-2">
          <p className="section-label">今日の売上</p>
          <Card className="space-y-3 p-4">
            <p className="text-[28px] font-bold tabular-nums leading-none">{formatYen(today?.amount ?? 0)}</p>
            <Totals totals={today ?? { orders: 0, pieces: 0, amount: 0, cups: 0, packs: 0 }} />
          </Card>
        </section>
      )}

      <section className="space-y-2">
        <p className="section-label">{manager ? "直近の売上" : "直近1時間の売上"}</p>
        {sales.length === 0 ? (
          <Card><EmptyState title={manager ? "まだ売上はありません" : "直近1時間の売上はありません"} /></Card>
        ) : (
          <Card className="divide-y divide-separator/70 overflow-hidden">
            {(manager ? sales.slice(0, RECENT_COUNT) : sales).map((sale) => (
              <div key={sale.id} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-headline tabular-nums">{sale.quantity}個 {formatYen(sale.amount)}</p>
                  <p className="truncate text-caption tabular-nums">{formatFestivalTime(sale.sold_at)}・{sale.recorder?.display_name ?? "退部した部員"}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setRemoving(sale)}>取り消す</Button>
              </div>
            ))}
          </Card>
        )}
        <p className="text-micro px-1">間違えたときは取り消して、入れ直してください。</p>
      </section>

      {manager && days.map((day) => (
        <section key={day.day} className="space-y-2">
          <p className="section-label">{dayLabel(day.day)}の時間帯ごと</p>
          <Card className="overflow-hidden">
            <div className="space-y-2 p-4">
              <p className="text-headline tabular-nums">{formatYen(day.amount)}</p>
              <Totals totals={day} />
            </div>
            <table className="w-full border-t border-separator/70 text-[14px] tabular-nums">
              <thead>
                <tr className="text-micro text-muted">
                  <th scope="col" className="px-4 py-2 text-left font-medium">時間帯</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">会計</th>
                  <th scope="col" className="px-2 py-2 text-right font-medium">個数</th>
                  <th scope="col" className="px-4 py-2 text-right font-medium">売上</th>
                </tr>
              </thead>
              <tbody>
                {day.hours.map((hour) => (
                  <tr key={hour.hour} className="border-t border-separator/50">
                    <th scope="row" className="px-4 py-2 text-left font-medium">{hour.hour}時台</th>
                    <td className="px-2 py-2 text-right">{hour.orders}件</td>
                    <td className="px-2 py-2 text-right">{hour.pieces}個</td>
                    <td className="px-4 py-2 text-right">{formatYen(hour.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      ))}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(next) => { if (!next && !removeBusy) setRemoving(null); }}
        title="この売上を取り消しますか？"
        description={removing ? `${formatFestivalTime(removing.sold_at)} ${removing.quantity}個 ${formatYen(removing.amount)}。集計から外れます。` : ""}
        confirmLabel="取り消す"
        busyLabel="取り消し中…"
        busy={removeBusy}
        onConfirm={remove}
      />
    </div>
  );
}

/** 選んだ個数は色を薄く敷くだけにして、数字と価格は濃い色のまま読めるようにする */
function QuantityButton({ value, active, large, onSelect }: { value: number; active: boolean; large?: boolean; onSelect: (next: number | null) => void }) {
  return (
    <button
      type="button"
      data-ui-action
      aria-pressed={active}
      onClick={() => onSelect(active ? null : value)}
      className={cn(
        "pressable flex flex-col items-center justify-center rounded-xl border-2 tabular-nums",
        large ? "h-[76px]" : "h-14",
        active ? "border-accent bg-accent/15" : "border-separator/70 bg-card",
      )}
    >
      <span className={cn("font-bold leading-none", large ? "text-[26px]" : "text-[18px]", active ? "text-accent" : "text-ink")}>{value}</span>
      <span className="mt-1 text-[12px] font-semibold leading-none text-ink">{formatYen(festivalPrice(value))}</span>
    </button>
  );
}

function Totals({ totals }: { totals: FestivalTotals }) {
  const items = [
    ["個数", `${totals.pieces}個`], ["会計", `${totals.orders}件`],
    ["紙コップ", `${totals.cups}個`], ["プラパック", `${totals.packs}個`],
  ];
  return (
    <dl className="grid grid-cols-4 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-micro text-muted">{label}</dt>
          <dd className="text-[15px] font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function dayLabel(day: string) {
  const [, month, date] = day.split("-").map(Number);
  return `${month}/${date}`;
}
