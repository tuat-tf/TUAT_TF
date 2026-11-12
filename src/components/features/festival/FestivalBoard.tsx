"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { Linkify } from "@/components/common/Linkify";
import { jstToday } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { FestivalBoardData, FestivalInstruction } from "@/lib/queries";
import { festivalStockLevel, formatFestivalTime, formatYen, jstDayHour, type FestivalTab } from "@/lib/festival";
import { FestivalInstructions } from "./FestivalInstructions";
import { FestivalSales } from "./FestivalSales";
import { FestivalStock } from "./FestivalStock";
import { FestivalShopping } from "./FestivalShopping";

const TABS: { key: FestivalTab; label: string }[] = [
  { key: "summary", label: "まとめ" },
  { key: "sales", label: "売上" },
  { key: "stock", label: "材料" },
  { key: "shopping", label: "買い出し" },
  { key: "instructions", label: "指示" },
];

const TRIP_STATUS = { open: "募集中", going: "買い出し中" } as const;

/**
 * 学祭の模擬店。最初の「まとめ」で、最新の指示・材料の残り・買い出しの募集が一目で分かる。
 * ほかのタブでは、まだ確認していない指示のうち最新の1件だけを上に出す（溜まっても長くならない）。
 * 開いていたタブはURLに残し、開き直しても同じ場所へ戻る。
 */
export function FestivalBoard({ data, userId, manager, initialTab }: { data: FestivalBoardData; userId: string; manager: boolean; initialTab: FestivalTab }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [tab, setTab] = useState(initialTab);
  const [acking, setAcking] = useState<string | null>(null);

  const isAcked = (row: FestivalInstruction) => row.acks.some((ack) => ack.user_id === userId);
  const unread = data.instructions.filter((row) => !row.closed_at && !isAcked(row));

  function select(next: FestivalTab) {
    setTab(next);
    window.history.replaceState(null, "", `?tab=${next}`);
    // タブを切り替えたときに、ほかの人の操作も読み直す。
    router.refresh();
  }

  async function acknowledge(id: string) {
    setAcking(id);
    try {
      const { data: rows, error } = await createClient()
        .from("festival_instruction_acks")
        .insert({ instruction_id: id, user_id: userId })
        .select("instruction_id");
      if (error || rows?.length !== 1) showToast("確認を保存できませんでした");
    } catch {
      showToast("確認を保存できませんでした");
    } finally {
      router.refresh();
      setAcking(null);
    }
  }

  return (
    <div className="space-y-4 px-4 pt-2 pb-8">
      {tab !== "summary" && tab !== "instructions" && unread[0] && (
        <InstructionCard row={unread[0]} acked={false} busy={acking === unread[0].id} onAck={acknowledge} highlight
          more={unread.length > 1 ? { label: `未確認の指示があと${unread.length - 1}件`, onClick: () => select("instructions") } : undefined} />
      )}
      <SegmentedControl items={TABS} value={tab} onChange={select} />
      {tab === "summary" && <FestivalSummary data={data} manager={manager} isAcked={isAcked} acking={acking} onAck={acknowledge} onOpen={select} />}
      {tab === "sales" && <FestivalSales sales={data.sales} userId={userId} manager={manager} />}
      {tab === "stock" && <FestivalStock items={data.stock} events={data.stockEvents} userId={userId} />}
      {tab === "shopping" && <FestivalShopping trips={data.trips} userId={userId} />}
      {tab === "instructions" && <FestivalInstructions instructions={data.instructions} userId={userId} manager={manager} />}
    </div>
  );
}

function InstructionCard({ row, acked, busy, onAck, highlight, more }: {
  row: FestivalInstruction; acked: boolean; busy: boolean; onAck: (id: string) => void; highlight?: boolean;
  more?: { label: string; onClick: () => void };
}) {
  return (
    <div role={highlight ? "status" : undefined} className={cn("space-y-2 rounded-card border p-4", highlight ? "border-accent/40 bg-accent/10" : "border-separator/70 bg-card")}>
      <p className="flex items-center gap-1.5 text-caption font-semibold text-accent">
        <Megaphone size={15} />店長から・{formatFestivalTime(row.created_at)}
      </p>
      <p className="whitespace-pre-wrap break-words text-[17px] font-semibold leading-relaxed"><Linkify text={row.body} /></p>
      <div className="flex flex-wrap items-center gap-2">
        {acked ? (
          <span className="flex items-center gap-1 text-caption text-muted"><Check size={15} />確認済み</span>
        ) : (
          <Button size="sm" className="min-w-[116px]" disabled={busy} onClick={() => onAck(row.id)}>
            <Check size={15} />確認しました
          </Button>
        )}
        {more && <Button size="sm" variant="ghost" onClick={more.onClick}>{more.label}</Button>}
      </div>
    </div>
  );
}

/** 一目で分かるまとめ。各ブロックを押すと、そのタブへ移る。 */
function FestivalSummary({ data, manager, isAcked, acking, onAck, onOpen }: {
  data: FestivalBoardData; manager: boolean; isAcked: (row: FestivalInstruction) => boolean;
  acking: string | null; onAck: (id: string) => void; onOpen: (tab: FestivalTab) => void;
}) {
  const current = data.instructions.filter((row) => !row.closed_at);
  const latest = current[0];
  const otherUnread = current.slice(1).filter((row) => !isAcked(row)).length;
  const activeTrips = data.trips.filter((trip) => trip.status !== "done");
  const todayKey = jstToday();
  const todayAmount = manager ? data.sales.filter((sale) => jstDayHour(sale.sold_at).day === todayKey).reduce((sum, sale) => sum + sale.amount, 0) : 0;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <SectionHead label="店長の指示" onOpen={() => onOpen("instructions")} />
        {latest ? (
          <InstructionCard row={latest} acked={isAcked(latest)} busy={acking === latest.id} onAck={onAck} highlight={!isAcked(latest)}
            more={current.length > 1 ? { label: `ほかの指示${current.length - 1}件${otherUnread > 0 ? `（未確認${otherUnread}）` : ""}`, onClick: () => onOpen("instructions") } : undefined} />
        ) : (
          <Card className="p-4"><p className="text-caption">いま有効な指示はありません。</p></Card>
        )}
      </section>

      {manager && (
        <section className="space-y-2">
          <SectionHead label="今日の売上" onOpen={() => onOpen("sales")} />
          <Card className="p-4"><p className="text-[28px] font-bold tabular-nums leading-none">{formatYen(todayAmount)}</p></Card>
        </section>
      )}

      <section className="space-y-2">
        <SectionHead label="材料の残り" onOpen={() => onOpen("stock")} />
        {data.stock.length === 0 ? (
          <Card className="p-4"><p className="text-caption">まだ材料はありません。</p></Card>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {data.stock.map((item) => {
              const level = festivalStockLevel(item.count, item.initial_count);
              return (
                <button key={item.id} type="button" data-ui-action onClick={() => onOpen("stock")}
                  className="pressable space-y-2 rounded-card border border-separator/70 bg-card p-3 text-left">
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

      <section className="space-y-2">
        <SectionHead label="買い出し" onOpen={() => onOpen("shopping")} />
        {activeTrips.length === 0 ? (
          <Card className="p-4"><p className="text-caption">募集中の買い出しはありません。</p></Card>
        ) : (
          <Card className="divide-y divide-separator/70 overflow-hidden">
            {activeTrips.map((trip) => (
              <button key={trip.id} type="button" data-ui-action onClick={() => onOpen("shopping")} className="pressable flex w-full items-center gap-3 px-4 py-3 text-left">
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
      <button type="button" data-ui-action onClick={onOpen} className="pressable flex items-center text-caption text-accent">
        開く<ChevronRight size={15} />
      </button>
    </div>
  );
}
