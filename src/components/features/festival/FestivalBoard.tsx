"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented";
import { jstToday } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { FestivalBoardData } from "@/lib/queries";
import { festivalStockLevel, formatYen, jstDayHour, type FestivalTab } from "@/lib/festival";
import { FestivalSales } from "./FestivalSales";
import { FestivalStock } from "./FestivalStock";
import type { FestivalDailyOrders } from "@/lib/queries";

const TABS: { key: FestivalTab; label: string }[] = [
  { key: "summary", label: "まとめ" },
  { key: "sales", label: "売上" },
  { key: "stock", label: "材料" },
];

/**
 * 学祭の模擬店。最初の「まとめ」で、売れた個数と材料の残りが一目で分かる。
 * 開いていたタブはURLに残し、開き直しても同じ場所へ戻る。
 */
export function FestivalBoard({ data, userId, manager, initialTab }: { data: FestivalBoardData; userId: string; manager: boolean; initialTab: FestivalTab }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);

  function select(next: FestivalTab) {
    setTab(next);
    window.history.replaceState(null, "", `?tab=${next}`);
    // タブを切り替えたときに、ほかの人の操作も読み直す。
    router.refresh();
  }

  return (
    <div className="space-y-4 px-4 pt-2 pb-8">
      <SegmentedControl items={TABS} value={tab} onChange={select} />
      {tab === "summary" && <FestivalSummary data={data} manager={manager} onOpen={select} />}
      {tab === "sales" && <FestivalSales sales={data.sales} userId={userId} manager={manager} />}
      {tab === "stock" && <FestivalStock items={data.stock} events={data.stockEvents} userId={userId} />}
    </div>
  );
}

/** 一目で分かるまとめ。各ブロックを押すと、そのタブへ移る。 */
function FestivalSummary({ data, manager, onOpen }: { data: FestivalBoardData; manager: boolean; onOpen: (tab: FestivalTab) => void }) {
  const todayKey = jstToday();
  const todayPieces = data.dailyPieces.find((day) => day.day === todayKey)?.pieces ?? 0;
  const pastDays = data.dailyPieces.filter((day) => day.day !== todayKey);
  const todayAmount = manager ? data.sales.filter((sale) => jstDayHour(sale.sold_at).day === todayKey).reduce((sum, sale) => sum + sale.amount, 0) : 0;

  return (
    <div className="space-y-3">
      <section className="space-y-1">
        <SectionHead label="売れた個数" onOpen={() => onOpen("sales")} />
        <Card className="space-y-3 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-caption">今日</p>
              <p className="text-[28px] font-bold tabular-nums leading-none">{todayPieces}<span className="ml-1 text-body text-muted">個</span></p>
            </div>
            {manager && <p className="text-headline tabular-nums">{formatYen(todayAmount)}</p>}
          </div>
          {pastDays.length > 0 && (
            <dl className="divide-y divide-separator/70 border-t border-separator/70">
              {pastDays.map((day) => (
                <div key={day.day} className="flex items-center justify-between py-2 tabular-nums">
                  <dt className="text-caption">{dayLabel(day.day)}</dt>
                  <dd className="text-[15px] font-semibold">{day.pieces}個</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </section>

      <FestivalOrdersTable orders={data.dailyOrders} />

      <section className="space-y-1">
        <SectionHead label="材料の残り" onOpen={() => onOpen("stock")} />
        {data.stock.length === 0 ? (
          <Card className="p-4"><p className="text-caption">まだ材料はありません。</p></Card>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {data.stock.map((item) => {
              const level = festivalStockLevel(item.count, item.initial_count);
              return (
                <button key={item.id} type="button" data-ui-panel onClick={() => onOpen("stock")}
                  className="pressable min-w-0 space-y-2 rounded-card border border-separator/70 bg-card p-3 text-left">
                  <p className="truncate text-caption font-semibold">{item.name}</p>
                  <p className="flex items-baseline gap-1 tabular-nums">
                    <span className={cn("text-[30px] font-bold leading-none", level.state === "ok" ? "text-ink" : "text-danger")}>{item.count}</span>
                    <span className="text-caption">/ {Math.max(item.initial_count, item.count)}</span>
                  </p>
                  <div className="h-1.5 overflow-hidden rounded-full bg-separator/60" aria-hidden="true">
                    <div className={cn("h-full rounded-full", level.state === "ok" ? "bg-accent" : "bg-danger")} style={{ width: `${level.percent}%` }} />
                  </div>
                  {level.state !== "ok" && <p className="text-micro font-semibold text-danger">{level.state === "empty" ? "なくなりました" : "残りわずか"}</p>}
                </button>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}

function SectionHead({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <p className="section-label">{label}</p>
      <button type="button" onClick={onOpen} className="pressable -mr-1 flex min-h-11 items-center pl-3 text-[13px] font-semibold text-accent">
        開く<ChevronRight size={15} />
      </button>
    </div>
  );
}

function dayLabel(day: string) {
  const [, month, date] = day.split("-").map(Number);
  return `${month}/${date}`;
}

/**
 * 日ごとに、何個入りのセットが何セット売れ、合わせて何個になったか。
 * 行は何個入り、列は日（古い順）と合計。各マスは「セット数」と、その下に「個数（セット数×何個入り）」。全員に見せてよい。
 */
function FestivalOrdersTable({ orders }: { orders: FestivalDailyOrders[] }) {
  if (orders.length === 0) return null;
  const days = [...new Set(orders.map((row) => row.day))].sort();
  const quantities = [...new Set(orders.map((row) => row.quantity))].sort((a, b) => a - b);
  const pick = (day: string | null, quantity: number | null) =>
    orders.filter((row) => (day === null || row.day === day) && (quantity === null || row.quantity === quantity));
  const sets = (rows: FestivalDailyOrders[]) => rows.reduce((sum, row) => sum + row.orders, 0);
  const pieces = (rows: FestivalDailyOrders[]) => rows.reduce((sum, row) => sum + row.orders * row.quantity, 0);
  const columns: (string | null)[] = days.length > 1 ? [...days, null] : days;

  const cell = (rows: FestivalDailyOrders[], key: string, strong = false) => {
    const count = sets(rows);
    return (
      <td key={key} className={cn("px-3 py-2 text-right align-top", count === 0 && "text-muted", strong && "font-semibold")}>
        <span className="block">{count}セット</span>
        {count > 0 && <span className="block text-micro text-muted">{pieces(rows)}個</span>}
      </td>
    );
  };

  return (
    <section className="space-y-1">
      <p className="section-label">セットごとの売れた数</p>
      <Card className="overflow-x-auto">
        <table className="w-full text-[14px] tabular-nums">
          <thead>
            <tr className="text-micro text-muted">
              <th scope="col" className="px-4 py-2 text-left font-medium">セット</th>
              {columns.map((day) => <th key={day ?? "total"} scope="col" className="px-3 py-2 text-right font-medium">{day ? dayLabel(day) : "合計"}</th>)}
            </tr>
          </thead>
          <tbody>
            {quantities.map((quantity) => (
              <tr key={quantity} className="border-t border-separator/50">
                <th scope="row" className="whitespace-nowrap px-4 py-2 text-left align-top font-medium">{quantity}個入り</th>
                {columns.map((day) => cell(pick(day, quantity), day ?? "total", day === null))}
              </tr>
            ))}
            <tr className="border-t border-separator/70">
              <th scope="row" className="px-4 py-2 text-left align-top font-semibold">合計</th>
              {columns.map((day) => cell(pick(day, null), day ?? "total", true))}
            </tr>
          </tbody>
        </table>
      </Card>
      <p className="text-micro px-1">上がセット数（会計の数）、下がそのセットで売れた個数です。</p>
    </section>
  );
}
