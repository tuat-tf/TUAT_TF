"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { jstToday } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { FestivalBoardData } from "@/lib/queries";
import { festivalStockLevel, formatYen, jstDayHour, type FestivalTab } from "@/lib/festival";
import { FestivalSales } from "./FestivalSales";
import { FestivalStock } from "./FestivalStock";
import { FestivalShopping } from "./FestivalShopping";

const TABS: { key: FestivalTab; label: string }[] = [
  { key: "summary", label: "まとめ" },
  { key: "sales", label: "売上" },
  { key: "stock", label: "材料" },
  { key: "shopping", label: "買い出し" },
];

const TRIP_STATUS = { open: "募集中", going: "買い出し中" } as const;

/**
 * 学祭の模擬店。最初の「まとめ」で、材料の残りと買い出しの募集が一目で分かる。
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
      {tab === "shopping" && <FestivalShopping trips={data.trips} userId={userId} />}
    </div>
  );
}

/** 一目で分かるまとめ。各ブロックを押すと、そのタブへ移る。 */
function FestivalSummary({ data, manager, onOpen }: { data: FestivalBoardData; manager: boolean; onOpen: (tab: FestivalTab) => void }) {
  const activeTrips = data.trips.filter((trip) => trip.status !== "done");
  const todayKey = jstToday();
  const todayAmount = manager ? data.sales.filter((sale) => jstDayHour(sale.sold_at).day === todayKey).reduce((sum, sale) => sum + sale.amount, 0) : 0;

  return (
    <div className="space-y-3">
      {manager && (
        <section className="space-y-1">
          <SectionHead label="今日の売上" onOpen={() => onOpen("sales")} />
          <Card className="p-4"><p className="text-[28px] font-bold tabular-nums leading-none">{formatYen(todayAmount)}</p></Card>
        </section>
      )}

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

      <section className="space-y-1">
        <SectionHead label="買い出し" onOpen={() => onOpen("shopping")} />
        {activeTrips.length === 0 ? (
          <Card className="p-4"><p className="text-caption">募集中の買い出しはありません。</p></Card>
        ) : (
          <Card className="divide-y divide-separator/70 overflow-hidden">
            {activeTrips.map((trip) => (
              <button key={trip.id} type="button" data-ui-row onClick={() => onOpen("shopping")} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <Badge className={trip.status === "going" ? "bg-accent/10 text-accent" : undefined}>{TRIP_STATUS[trip.status as keyof typeof TRIP_STATUS]}</Badge>
                <span className="min-w-0 flex-1 truncate text-headline">{trip.title}</span>
                <span className="shrink-0 text-caption tabular-nums">行く人 {trip.members.length}人</span>
              </button>
            ))}
          </Card>
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
