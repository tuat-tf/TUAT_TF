"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import {
  startOfDay,
  startOfWeek,
  startOfMonth,
  subDays,
  subWeeks,
  subMonths,
  isSameDay,
  format,
} from "date-fns";
import { ja } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { jstToday } from "@/lib/date";
import { Card } from "@/components/ui/card";
import { KeyValue } from "@/components/ui/key-value";
import { SegmentedControl } from "@/components/ui/segmented";
import { INTENSITY_ORDER, INTENSITY_LABELS } from "@/lib/constants";
import { cn, formatKm, roundKm } from "@/lib/utils";
import { displayedDistance, unclassifiedDistance } from "@/lib/record-distance";
import { isRecordHashtagField } from "@/lib/hashtags";
import { useBooleanPreference } from "@/hooks/use-boolean-preference";
import { useTrainingReviewSelection } from "@/hooks/use-training-review-selection";
import { recentTrainingRecords, trainingReviewFields, trainingReviewPreferenceKey } from "@/lib/training-review-display";
import type { TrainingRecord, Intensity, RecordFieldDef } from "@/types";

type Period = "recent" | "day" | "week" | "month";

const COUNTS: Record<Period, number> = { recent: 7, day: 35, week: 16, month: 12 };
const AREA = 84;
const VALUE_AREA = 16;
const CHART_HEIGHT = AREA + VALUE_AREA;

interface Bucket {
  start: Date;
  by: Record<Intensity, number>;
  unclassified: number;
  total: number;
  records: TrainingRecord[];
}

function bucketStart(d: Date, period: Period): Date {
  if (period === "day" || period === "recent") return startOfDay(d);
  if (period === "week") return startOfWeek(d, { weekStartsOn: 1 });
  return startOfMonth(d);
}

/** 練習量の推移。日/週/月を切り替え、横スライドで過去を遡れる。棒タップで内訳。 */
export function TrainingChart({
  records,
  viewerId,
  recordFields = [],
  initialShowAllFields = false,
}: {
  records: TrainingRecord[];
  viewerId?: string;
  recordFields?: RecordFieldDef[];
  initialShowAllFields?: boolean;
}) {
  const [period, setPeriod] = useState<Period>("recent");
  const [selected, setSelected] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const detailId = useId();
  const [showAllFields, setShowAllFields] = useBooleanPreference(
    initialShowAllFields,
    viewerId ? trainingReviewPreferenceKey(viewerId) : undefined,
  );
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [selectedFields, setSelectedFields] = useTrainingReviewSelection(viewerId);
  const availableFields = useMemo(() => {
    const options = new Map<string, string>();
    for (const r of records) for (const field of trainingReviewFields(r, recordFields, true)) {
      if (!options.has(field.key)) options.set(field.key, field.label);
    }
    return [...options].map(([key, label]) => ({ key, label }));
  }, [records, recordFields]);
  const effectiveFields = selectedFields ?? [...new Set(records.flatMap(r => trainingReviewFields(r, recordFields, false).map(f => f.key)))];
  const today = jstToday();
  const scrollRef = useRef<HTMLDivElement>(null);

  const buckets = useMemo<Bucket[]>(() => {
    const count = COUNTS[period];
    const now = new Date(`${today}T00:00:00`);
    const arr: Bucket[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const base =
        period === "day" || period === "recent" ? subDays(now, i) : period === "week" ? subWeeks(now, i) : subMonths(now, i);
      arr.push({ start: bucketStart(base, period), by: { low: 0, mid: 0, high: 0, speed: 0 }, unclassified: 0, total: 0, records: [] });
    }
    for (const r of records) {
      const start = bucketStart(new Date(r.recorded_date + "T00:00:00"), period);
      const b = arr.find((x) => isSameDay(x.start, start));
      if (!b) continue;
      b.by.low += r.dist_low;
      b.by.mid += r.dist_mid;
      b.by.high += r.dist_high;
      b.by.speed += r.dist_speed;
      b.unclassified += unclassifiedDistance(r);
      b.records.push(r);
    }
    for (const b of arr) {
      b.total = roundKm(b.by.low + b.by.mid + b.by.high + b.by.speed + b.unclassified);
    }
    return arr;
  }, [records, period, today]);

  const max = Math.max(...buckets.map((b) => b.total), 1);
  // 期間切替直後は前の選択番号が範囲外になりうるので必ず範囲内へ収める
  const rawIndex = selected ?? buckets.length - 1;
  const selIndex = rawIndex >= 0 && rawIndex < buckets.length ? rawIndex : buckets.length - 1;
  const recent = period === "recent";
  const sel = recent ? {
    start: buckets[0].start,
    by: Object.fromEntries(INTENSITY_ORDER.map(key => [key, buckets.reduce((sum, b) => sum + b.by[key], 0)])) as Record<Intensity, number>,
    unclassified: buckets.reduce((sum, b) => sum + b.unclassified, 0),
    total: roundKm(buckets.reduce((sum, b) => sum + b.total, 0)),
    records: recentTrainingRecords(records, today),
  } : buckets[selIndex];
  const previousStart = recent ? subDays(sel.start, 7) : period === "day"
    ? subDays(sel.start, 1)
    : period === "week" ? subWeeks(sel.start, 1) : subMonths(sel.start, 1);
  const previousFrom = format(previousStart, "yyyy-MM-dd");
  const previousThrough = format(subDays(sel.start, 1), "yyyy-MM-dd");
  const previousTotal = records.reduce((sum, record) =>
    record.recorded_date >= previousFrom && record.recorded_date <= previousThrough
      ? sum + displayedDistance(record) : sum, 0);

  // 期間切替・初期表示で右端（最新）までスクロール
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [period]);

  function changePeriod(next: Period) {
    setSelected(null);
    setShowDetail(false);
    setPeriod(next);
  }

  function bucketLabel(b: Bucket, long = false): string {
    if (period === "day" || period === "recent") return format(b.start, long ? "M月d日(E)" : "M/d", { locale: ja });
    if (period === "week") return long ? `${format(b.start, "M/d", { locale: ja })}の週` : format(b.start, "M/d", { locale: ja });
    return format(b.start, long ? "yyyy年M月" : "M月", { locale: ja });
  }

  const labelEvery = period === "day" ? 5 : period === "week" ? 2 : 1;

  return (
    <Card className="p-4 space-y-3">
      <div data-training-periods className="min-w-0">
        <SegmentedControl
          items={[
            { key: "recent", label: "直近7日" },
            { key: "day", label: "日" },
            { key: "week", label: "週" },
            { key: "month", label: "月" },
          ]}
          value={period}
          onChange={(key) => changePeriod(key as Period)}
        />
      </div>

      <IntensitySummary summary={sel} period={period} label={recent ? `${format(sel.start, "M/d")}〜${format(new Date(today+"T00:00:00"), "M/d")}` : bucketLabel(sel, true)} previousTotal={previousTotal}>
      {recent ? <RecentWeekBars buckets={buckets} total={sel.total} today={today} /> : (

      <div ref={scrollRef} className="h-full overflow-x-auto overflow-y-hidden -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="relative w-max">
          {/* 目盛り線 */}
          <div
            className="pointer-events-none absolute left-0 right-0 flex flex-col justify-between"
            style={{ height: `${AREA}px`, top: `${VALUE_AREA}px` }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-t border-separator/40" />
            ))}
          </div>

          {/* 棒 */}
          <div className="relative flex items-end gap-2" style={{ height: `${CHART_HEIGHT}px` }}>
            {buckets.map((b, i) => {
              const barH = b.total > 0 ? Math.max((b.total / max) * AREA, 6) : 0;
              const isSel = !recent && i === selIndex;
              return (
                <button
                  key={i}
                  type="button"
                  data-ui-chart-bar
                  aria-label={`${bucketLabel(b, true)} ${formatDistance(b.total)}km`}
                  aria-pressed={isSel}
                  onClick={() => {
                    setSelected(i);
                    setShowDetail(false);
                  }}
                  className="relative h-full w-6 shrink-0"
                >
                  {barH > 0 ? (
                    <>
                      <span
                        className={cn(
                          "absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-semibold tabular-nums",
                          isSel ? "text-accent" : "text-muted2",
                        )}
                        style={{ bottom: `${barH + 3}px` }}
                      >
                        {formatDistance(b.total)}
                      </span>
                      <BarStack
                        bucket={b}
                        height={barH}
                        className={cn(
                          "w-full transition-all",
                          isSel ? "border-accent ring-2 ring-inset ring-accent/60" : "border-separator/70 opacity-95",
                        )}
                      />
                    </>
                  ) : (
                    <div className="absolute bottom-0 left-1/2 h-1 w-full -translate-x-1/2 rounded-t-[3px] bg-separator/60" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ラベル（間引き） */}
          <div data-training-axis aria-hidden="true" className="flex gap-2 mt-1.5">
            {buckets.map((b, i) => {
              const show = (buckets.length - 1 - i) % labelEvery === 0;
              return (
                <div key={i} className="h-4 w-6 shrink-0 whitespace-nowrap text-center leading-4">
                  {show && (
                    <span className={cn("text-[9px]", !recent && i === selIndex ? "text-accent font-bold" : "text-muted2")}>
                      {bucketLabel(b)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}
      </IntensitySummary>

      {/* この期間の記録。開いてから、見たい項目だけに絞れる。 */}
      <div data-training-detail className="rounded-xl bg-bg">
        <div className="flex items-center gap-1 pr-1">
          <button type="button" data-ui-disclosure aria-expanded={showDetail} aria-controls={detailId} onClick={() => setShowDetail(current => !current)} className="flex min-h-11 min-w-0 flex-1 items-center gap-1.5 px-3 text-left text-[13px] font-semibold">
            この期間の記録
            <ChevronDown size={16} className={cn("shrink-0 text-muted transition-transform", showDetail && "rotate-180")} aria-hidden="true" />
          </button>
          {showDetail && <Button variant="ghost" size="sm" className="shrink-0 text-[12px] text-accent" onClick={() => setFieldPickerOpen(true)}>項目を選ぶ</Button>}
        </div>
        <Sheet open={fieldPickerOpen} onOpenChange={setFieldPickerOpen}>
          <SheetContent title="表示する項目">
            <div className="space-y-1">
              <label className="flex min-h-11 items-center gap-3 rounded-xl px-3">
                <input type="checkbox" checked={showAllFields} onChange={event => setShowAllFields(event.target.checked)} className="h-5 w-5 accent-accent" />
                <span className="text-body font-semibold">すべて</span>
              </label>
              {availableFields.map(field => <label key={field.key} className="flex min-h-11 items-center gap-3 rounded-xl px-3">
                <input type="checkbox" checked={effectiveFields.includes(field.key)} onChange={event => { setSelectedFields(event.target.checked ? [...effectiveFields, field.key] : effectiveFields.filter(key => key !== field.key)); setShowAllFields(false); }} className="h-5 w-5 accent-accent" />
                <span className="text-body">{field.label}</span>
              </label>)}
              {availableFields.length === 0 && <p className="text-caption">表示できる練習記録がありません。</p>}
            </div>
            <Button size="lg" className="mt-4" onClick={() => { setFieldPickerOpen(false); setShowDetail(true); }}>完了</Button>
          </SheetContent>
        </Sheet>
        <div id={detailId} hidden={!showDetail} className="px-3 pb-3">
          {showDetail && (sel.records.length === 0 ? (
            <p className="text-caption">この期間は記録がありません</p>
          ) : (
            <div className="space-y-2">
              {sel.records.map((r) => {
                const fields = trainingReviewFields(r, recordFields, showAllFields || selectedFields !== null).filter(field => showAllFields || selectedFields === null || selectedFields.includes(field.key));
                return (
                  <div key={r.id} className="text-[12px] space-y-0.5">
                    <p className="font-semibold flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span>{format(new Date(r.recorded_date + "T00:00:00"), "M/d(E)", { locale: ja })}</span>
                    </p>
                    <dl>
                      {fields.map((field) => <KeyValue key={field.key} label={field.label} value={field.value} className="[&>dt]:[overflow-wrap:anywhere]" collapsible hashtags={isRecordHashtagField(field.key)} />)}
                    </dl>
                    {fields.length === 0 && (
                      <p className="text-caption">表示する内容はありません</p>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function formatDistance(value: number): string {
  return formatKm(value);
}

function IntensitySummary({
  summary, period, label, previousTotal, children,
}: {
  summary: Bucket;
  period: Period;
  label: string;
  previousTotal: number;
  children: ReactNode;
}) {
  const difference = summary.total - previousTotal;
  // 直近7日の「前」も、部員の感覚では先週。
  const previousLabel = period === "day" ? "前日" : period === "month" ? "先月" : "先週";
  const periodComparison = Math.abs(difference) < 0.05
    ? `${previousLabel}と同じ`
    : `${previousLabel}比 ${difference > 0 ? "+" : "−"}${formatDistance(Math.abs(difference))}km`;
  const segments = [
    ...INTENSITY_ORDER.map((intensity) => ({ key: intensity, label: INTENSITY_LABELS[intensity].label, value: summary.by[intensity], color: INTENSITY_LABELS[intensity].color, className: undefined })),
    { key: "unclassified", label: "その他", value: summary.unclassified, color: undefined, className: "bg-muted/35" },
  ].filter((segment) => segment.value > 0);

  return (
    <div data-training-summary>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[12px] text-muted2" title={label}>{label}</p>
        <p className="shrink-0 text-xl font-bold leading-6 tabular-nums">
          {formatDistance(summary.total)}
          <span className="ml-0.5 text-caption">km</span>
        </p>
      </div>
      <p className="text-right text-caption tabular-nums">{periodComparison}</p>

      <div data-training-visualization className="mt-2 h-[122px]">
        {children}
      </div>
      {segments.length > 0 && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((segment) => (
          <span key={segment.key} className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted2">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", segment.className)} style={segment.color ? { backgroundColor: segment.color } : undefined} />
            {segment.label} {formatDistance(segment.value)}km
          </span>
        ))}
      </div>}
    </div>
  );
}

/** 強度別に色を積み上げた1本の棒（下から低強度→…→その他）。 */
function BarStack({ bucket, height, className }: { bucket: Bucket; height: number; className?: string }) {
  return (
    <div
      className={cn("absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col-reverse overflow-hidden rounded-t-[4px] border shadow-sm", className)}
      style={{ height: `${height}px` }}
    >
      {INTENSITY_ORDER.map((k) =>
        bucket.by[k] > 0 ? (
          <div key={k} style={{ height: `${(bucket.by[k] / bucket.total) * 100}%`, backgroundColor: INTENSITY_LABELS[k].color }} />
        ) : null,
      )}
      {bucket.unclassified > 0 && (
        <div aria-label={`その他 ${formatDistance(bucket.unclassified)}km`} className="bg-muted/35" style={{ height: `${(bucket.unclassified / bucket.total) * 100}%` }} />
      )}
    </div>
  );
}

const WEEK_BAR_AREA = 76;

/** 直近7日を1日1本で並べる。横スクロールなしで幅いっぱいに収め、今日を強調する。 */
function RecentWeekBars({ buckets, total, today }: { buckets: Bucket[]; total: number; today: string }) {
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const days = buckets.map((b) => `${format(b.start, "M/d")} ${formatDistance(b.total)}km`).join("、");
  return (
    <div
      data-training-week
      role="img"
      aria-label={total > 0 ? `直近7日間の日別走行距離、合計${formatDistance(total)}km（${days}）` : "直近7日間の走行距離は0kmです"}
      className="grid h-full grid-cols-7 gap-1.5"
    >
      {buckets.map((b) => {
        const barH = b.total > 0 ? Math.max((b.total / max) * WEEK_BAR_AREA, 6) : 0;
        const isToday = format(b.start, "yyyy-MM-dd") === today;
        return (
          <div key={b.start.getTime()} className="flex min-w-0 flex-col items-center">
            <div className="relative w-full flex-1">
              {barH > 0 ? (
                <>
                  <span
                    className={cn("absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold tabular-nums", isToday ? "text-accent" : "text-muted2")}
                    style={{ bottom: `${barH + 2}px` }}
                  >
                    {formatDistance(b.total)}
                  </span>
                  <BarStack bucket={b} height={barH} className={cn("w-full max-w-7", isToday ? "border-accent" : "border-separator/70")} />
                </>
              ) : (
                <div className="absolute bottom-0 left-1/2 h-1 w-full max-w-7 -translate-x-1/2 rounded-t-[3px] bg-separator/60" />
              )}
            </div>
            <span className={cn("mt-1 text-[11px] leading-[14px]", isToday ? "font-bold text-accent" : "text-muted2")}>
              {isToday ? "今日" : format(b.start, "E", { locale: ja })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
