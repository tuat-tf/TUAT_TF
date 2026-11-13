import Link from "next/link";
import { ChevronRight, Store } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { festivalStockLevel } from "@/lib/festival";
import type { FestivalHomeData } from "@/lib/queries";

/**
 * ホームの一番上に出す学祭の入口。今日売れた個数と、材料ごとの残り（少ないものは赤）を出す。
 * 学祭の権限を持つ部員にだけ出す（ホーム側で判定）。
 */
export function FestivalHomeCard({ data, today }: { data: FestivalHomeData; today: string }) {
  const todayPieces = data.dailyPieces.find((day) => day.day === today)?.pieces ?? 0;

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
      {data.stock.length > 0 && (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-separator/70 px-4 py-3">
          {data.stock.map((item) => {
            const level = festivalStockLevel(item.count, item.initial_count);
            const low = level.state !== "ok";
            return (
              <li key={item.id} className="min-w-0 space-y-1">
                <div className="flex items-baseline justify-between gap-2 tabular-nums">
                  <span className="truncate text-caption">{item.name}</span>
                  <span className={cn("shrink-0 text-[15px] font-semibold", low && "text-danger")}>
                    {level.state === "empty" ? "なし" : item.count}
                    {level.state !== "empty" && <span className="text-micro font-normal text-muted"> / {Math.max(item.initial_count, item.count)}</span>}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-separator/60" aria-hidden="true">
                  <div className={cn("h-full rounded-full", low ? "bg-danger" : "bg-accent")} style={{ width: `${level.percent}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-2 divide-x divide-separator/70 border-t border-separator/70">
        <Link data-ui-row href="/festival?tab=sales" prefetch={false} className="py-3 text-center text-[15px] font-semibold text-accent">売上を入力</Link>
        <Link data-ui-row href="/festival?tab=stock" prefetch={false} className="py-3 text-center text-[15px] font-semibold text-accent">材料</Link>
      </div>
    </Card>
  );
}
