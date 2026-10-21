import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Matches the period controls, summary, graph and collapsed training details. */
export function TrainingChartSkeleton() {
  return (
    <Card data-training-skeleton role="status" aria-label="練習量を読み込み中" className="p-4 space-y-3">
      <span className="sr-only">練習量を読み込み中</span>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-[34px] w-full rounded-[10px] lg:h-8 lg:rounded-lg" />
      </div>
      <div>
        <div className="flex h-6 items-center justify-between gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="mt-1 flex h-[18px] items-center"><Skeleton className="h-2.5 w-36" /></div>
        <Skeleton className="mt-1 h-2 w-full rounded-full" />
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex h-[16.5px] items-center gap-1">
              <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="-mx-1 px-1">
        <div className="grid h-[100px] grid-cols-7 items-end justify-items-center gap-2 border-b border-separator/40">
          {[24, 48, 36, 64, 40, 72, 56].map((height, index) => (
            <Skeleton key={index} className="w-full max-w-12 rounded-t-[4px] rounded-b-none" style={{ height }} />
          ))}
        </div>
        <div className="mt-1.5 grid h-4 grid-cols-7 items-center justify-items-center gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((index) => <Skeleton key={index} className="h-2 w-6" />)}
        </div>
      </div>
      <div className="rounded-xl bg-bg p-3">
        <div className="space-y-1.5">
          <div className="flex h-[18px] items-center"><Skeleton className="h-2.5 w-24" /></div>
          <Skeleton className="h-[34px] w-full rounded-[10px] lg:h-8 lg:rounded-lg" />
        </div>
        <div className="mt-3 border-t border-separator/70">
          <div className="flex h-11 items-center justify-between gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-3 rounded-full" />
          </div>
        </div>
      </div>
    </Card>
  );
}
