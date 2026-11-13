import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import { Card } from "@/components/ui/card";
import { festivalStockLevel } from "@/lib/festival";
import type { FestivalHomeData } from "@/lib/queries";

/**
 * ホームの一番上に出す学祭の入口。今日売れた個数と、残りが少ない材料だけを出す。
 * 学祭の権限を持つ部員にだけ出す（ホーム側で判定）。
 */
export function FestivalHomeCard({ data, today }: { data: FestivalHomeData; today: string }) {
  const todayPieces = data.dailyPieces.find((day) => day.day === today)?.pieces ?? 0;
  const short = data.stock
    .map((item) => ({ item, level: festivalStockLevel(item.count, item.initial_count) }))
    .filter(({ level }) => level.state !== "ok");

  return (
    <Card className="overflow-hidden">
      <Link data-ui-row href="/festival" prefetch={false} className="flex items-center gap-3 px-4 py-3">
        <Store size={20} className="shrink-0 text-accent" />
        <span className="flex-1 text-headline">学祭</span>
        <span className="flex shrink-0 items-baseline gap-1 tabular-nums">
          <span className="text-caption">今日</span>
          <span className="text-[22px] font-bold leading-none">{todayPieces}</span>
          <span className="text-caption">個</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-muted" />
      </Link>
      {short.length > 0 && (
        <p className="border-t border-separator/70 px-4 py-2 text-caption">
          {short.map(({ item, level }, index) => (
            <span key={item.id}>
              {index > 0 && "・"}
              <span className="font-semibold text-danger">{item.name} {level.state === "empty" ? "なし" : `残り${item.count}`}</span>
            </span>
          ))}
        </p>
      )}
      <div className="grid grid-cols-2 divide-x divide-separator/70 border-t border-separator/70">
        <Link data-ui-row href="/festival?tab=sales" prefetch={false} className="py-3 text-center text-[15px] font-semibold text-accent">売上を入力</Link>
        <Link data-ui-row href="/festival?tab=stock" prefetch={false} className="py-3 text-center text-[15px] font-semibold text-accent">材料</Link>
      </div>
    </Card>
  );
}
