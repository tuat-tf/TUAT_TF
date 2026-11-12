"use client";

import { useState } from "react";
import { SegmentedControl } from "@/components/ui/segmented";
import type { FestivalBoardData } from "@/lib/queries";
import type { FestivalTab } from "@/lib/festival";
import { FestivalInstructions } from "./FestivalInstructions";
import { FestivalSales } from "./FestivalSales";
import { FestivalStock } from "./FestivalStock";
import { FestivalShopping } from "./FestivalShopping";

const TAB_ITEMS: { key: FestivalTab; label: string }[] = [
  { key: "instructions", label: "指示" },
  { key: "sales", label: "売上" },
  { key: "stock", label: "材料" },
  { key: "shopping", label: "買い出し" },
];

/** 学祭の模擬店（試験機能）。開いていたタブはURLに残し、開き直しても同じ場所へ戻る。 */
export function FestivalBoard({ data, userId, initialTab }: { data: FestivalBoardData; userId: string; initialTab: FestivalTab }) {
  const [tab, setTab] = useState(initialTab);

  function select(next: FestivalTab) {
    setTab(next);
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  return (
    <div className="space-y-4 px-4 pt-2 pb-8">
      <SegmentedControl items={TAB_ITEMS} value={tab} onChange={select} />
      {tab === "instructions" && <FestivalInstructions instructions={data.instructions} userId={userId} />}
      {tab === "sales" && <FestivalSales sales={data.sales} userId={userId} />}
      {tab === "stock" && <FestivalStock items={data.stock} userId={userId} />}
      {tab === "shopping" && <FestivalShopping trips={data.trips} userId={userId} />}
    </div>
  );
}
