"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { useToast } from "@/components/ui/toast";
import { Linkify } from "@/components/common/Linkify";
import type { FestivalBoardData } from "@/lib/queries";
import { festivalStockLevel, formatFestivalTime, type FestivalTab } from "@/lib/festival";
import { FestivalInstructions } from "./FestivalInstructions";
import { FestivalSales } from "./FestivalSales";
import { FestivalStock } from "./FestivalStock";
import { FestivalShopping } from "./FestivalShopping";

/**
 * 学祭の模擬店（試験機能）。
 * まだ確認していない店長の指示は、どのタブを開いていても一番上に出す。
 * 開いていたタブはURLに残し、開き直しても同じ場所へ戻る。
 */
export function FestivalBoard({ data, userId, initialTab }: { data: FestivalBoardData; userId: string; initialTab: FestivalTab }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [tab, setTab] = useState(initialTab);
  const [acking, setAcking] = useState<string | null>(null);

  const unread = data.instructions.filter((row) => !row.closed_at && !row.acks.some((ack) => ack.user_id === userId));
  const lowStock = data.stock.filter((item) => festivalStockLevel(item.count, item.initial_count).state !== "ok").length;
  const openTrips = data.trips.filter((trip) => trip.status === "open").length;

  // 数字はタブの幅を変えない（等幅の列）。0のときは付けない。
  const withCount = (label: string, count: number) => (count > 0 ? `${label} ${count}` : label);
  const tabs: { key: FestivalTab; label: string }[] = [
    { key: "sales", label: "売上" },
    { key: "stock", label: withCount("材料", lowStock) },
    { key: "shopping", label: withCount("買い出し", openTrips) },
    { key: "instructions", label: "指示" },
  ];

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
      {unread.map((row) => (
        <div key={row.id} role="status" className="space-y-2 rounded-card border border-accent/40 bg-accent/10 p-4">
          <p className="flex items-center gap-1.5 text-caption font-semibold text-accent">
            <Megaphone size={15} />店長から・{formatFestivalTime(row.created_at)}
          </p>
          <p className="whitespace-pre-wrap break-words text-[17px] font-semibold leading-relaxed"><Linkify text={row.body} /></p>
          <Button size="sm" className="min-w-[116px]" disabled={acking === row.id} onClick={() => acknowledge(row.id)}>
            <Check size={15} />確認しました
          </Button>
        </div>
      ))}
      <SegmentedControl items={tabs} value={tab} onChange={select} />
      {tab === "sales" && <FestivalSales sales={data.sales} userId={userId} />}
      {tab === "stock" && <FestivalStock items={data.stock} userId={userId} />}
      {tab === "shopping" && <FestivalShopping trips={data.trips} userId={userId} />}
      {tab === "instructions" && <FestivalInstructions instructions={data.instructions} userId={userId} />}
    </div>
  );
}
