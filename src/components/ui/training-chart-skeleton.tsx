import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Matches the period controls, summary, graph and collapsed training details. */
export function TrainingChartSkeleton() {
  return (
    <Card data-training-skeleton role="status" aria-label="練習量を読み込み中" className="p-4 space-y-3">
      <span className="sr-only">練習量を読み込み中</span>
      <div className="space-y-3">
        <div className="flex h-[18px] items-center"><Skeleton className="h-3 w-24" /></div>
        <Skeleton className="h-12 w-full rounded-[10px] lg:rounded-lg" />
      </div>
      <div>
        <div className="flex h-6 items-center justify-between gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
        <div className="mt-1 flex h-[18px] items-center"><Skeleton className="h-2.5 w-36" /></div>
        <div className="mt-2 flex h-[122px] items-center justify-center">
          <Skeleton className="h-28 w-28 rounded-full [mask-image:radial-gradient(circle,transparent_47%,black_48%)]" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex h-4 items-center gap-1">
              <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-bg p-3">
        <div className="space-y-1.5">
          <div className="flex h-[18px] items-center"><Skeleton className="h-2.5 w-24" /></div>
          <Skeleton className="h-12 w-full rounded-[10px] lg:rounded-lg" />
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
