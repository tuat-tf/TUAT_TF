import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Matches the period controls, summary, graph and collapsed training details. */
export function TrainingChartSkeleton() {
  return (
    <Card data-training-skeleton role="status" aria-label="練習量を読み込み中" className="p-4 space-y-3">
      <span className="sr-only">練習量を読み込み中</span>
      {/* 期間の切替（直近7日/日/週/月）。ガラスの区切りボタンと同じ高さ。 */}
      <div className="flex h-12 items-stretch gap-0.5 rounded-full bg-separator/50 p-0.5">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={`flex min-w-0 flex-1 items-center justify-center rounded-full px-1 ${index === 0 ? "bg-card shadow-sm" : ""}`}>
            <Skeleton className="h-2.5 w-10 max-w-full rounded-full" />
          </div>
        ))}
      </div>
      <div>
        <div className="flex h-[27px] items-center justify-between gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="flex h-[18px] items-center justify-end"><Skeleton className="h-2.5 w-20" /></div>
        <div className="mt-2 grid h-[122px] grid-cols-7 gap-1.5">
          {BAR_HEIGHTS.map((height, index) => (
            <div key={index} className="flex min-w-0 flex-col items-center">
              <div className="flex w-full flex-1 items-end justify-center">
                <Skeleton className="w-full max-w-7 rounded-b-none rounded-t-[4px]" style={{ height }} />
              </div>
              <div className="mt-1 flex h-[14px] items-center"><Skeleton className="h-2.5 w-4" /></div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex h-[17px] items-center gap-1">
              <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
              <Skeleton className="h-2.5 w-14" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-h-11 items-center gap-1.5 rounded-xl bg-bg px-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3 w-3 rounded-full" />
      </div>
    </Card>
  );
}

/** Placeholder bar heights within the real 7-day chart's 76px bar area (4px = an empty day). */
const BAR_HEIGHTS = [44, 4, 62, 30, 76, 4, 52];
