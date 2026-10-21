"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Disclosure } from "@/components/ui/disclosure";
import { KeyValue } from "@/components/ui/key-value";
import { SegmentedControl } from "@/components/ui/segmented";
import { INTENSITY_ORDER, INTENSITY_LABELS } from "@/lib/constants";
import { cn, formatKm, roundKm } from "@/lib/utils";
import { displayedDistance, unclassifiedDistance } from "@/lib/record-distance";
import { useBooleanPreference } from "@/hooks/use-boolean-preference";
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
  showIntensitySummary = false,
  viewerId,
  recordFields = [],
  initialShowAllFields = false,
}: {
  records: TrainingRecord[];
  showIntensitySummary?: boolean;
  viewerId?: string;
  recordFields?: RecordFieldDef[];
  initialShowAllFields?: boolean;
}) {
  const [period, setPeriod] = useState<Period>("recent");
  const [selected, setSelected] = useState<number | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showAllFields, setShowAllFields] = useBooleanPreference(
    initialShowAllFields,
    viewerId ? trainingReviewPreferenceKey(viewerId) : undefined,
  );
  const [fieldPickerOpen, setFieldPickerOpen] = useState(false);
  const [selectedFields, setSelectedFields] = useState<string[] | null>(null);
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
  const recent = period === "recent" && selected === null;
  const sel = recent ? {
    start: buckets[0].start,
    by: Object.fromEntries(INTENSITY_ORDER.map(key => [key, buckets.reduce((sum, b) => sum + b.by[key], 0)])) as Record<Intensity, number>,
    unclassified: buckets.reduce((sum, b) => sum + b.unclassified, 0),
    total: roundKm(buckets.reduce((sum, b) => sum + b.total, 0)),
    records: recentTrainingRecords(records, today),
  } : buckets[selIndex];
  const previousStart = recent ? subDays(sel.start, 7) : period === "day" || period === "recent"
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

  const labelEvery = period === "recent" ? 1 : period === "day" ? 5 : period === "week" ? 2 : 1;

  return (
    <Card className="p-4 space-y-3">
      <div data-training-periods className="flex flex-wrap items-center justify-between gap-3">
        <p className="section-label">{showIntensitySummary ? "走行サマリー" : "練習量の推移"}</p>
        <div className="w-full min-w-0">
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
      </div>

      <IntensitySummary summary={sel} period={recent ? "recent" : period === "recent" ? "day" : period} label={recent ? `直近7日間（${format(sel.start, "M/d")}〜${format(new Date(today+"T00:00:00"), "M/d")}）` : bucketLabel(sel, true)} previousTotal={previousTotal} />
      {period === "recent" && selected !== null && <Button variant="ghost" onClick={() => { setSelected(null); setShowDetail(false); }}>直近7日間の合計に戻る</Button>}

      {/* 直近7日は全幅、長い期間は横スクロールで表示する。 */}
      <div ref={scrollRef} className="overflow-x-auto -mx-1 px-1">
        <div className={cn("relative", period === "recent" ? "w-full" : "w-max")}>
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
                  className={cn("relative h-full", period === "recent" ? "min-w-0 flex-1" : "w-6 shrink-0")}
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
                      <div
                        className={cn(
                          "absolute bottom-0 left-1/2 flex w-full -translate-x-1/2 flex-col-reverse overflow-hidden rounded-t-[4px] border shadow-sm transition-all",
                          period === "recent" && "max-w-12",
                          isSel ? "border-accent ring-2 ring-inset ring-accent/60" : "border-separator/70 opacity-95",
                        )}
                        style={{ height: `${barH}px` }}
                      >
                        {INTENSITY_ORDER.map((k) =>
                          b.by[k] > 0 ? (
                            <div
                              key={k}
                              style={{
                                height: `${(b.by[k] / b.total) * 100}%`,
                                backgroundColor: INTENSITY_LABELS[k].color,
                              }}
                            />
                          ) : null,
                        )}
                        {b.unclassified > 0 && (
                          <div aria-label={`その他 ${formatDistance(b.unclassified)}km`} className="bg-muted/35" style={{ height: `${(b.unclassified / b.total) * 100}%` }} />
                        )}
                      </div>
                    </>
                  ) : (
                    <div className={cn("absolute bottom-0 left-1/2 h-1 w-full -translate-x-1/2 rounded-t-[3px] bg-separator/60", period === "recent" && "max-w-12")} />
                  )}
                </button>
              );
            })}
          </div>

          {/* ラベル（間引き） */}
          <div data-training-axis aria-hidden="true" className="flex gap-2 mt-1.5">
            {buckets.map((b, i) => {
              const show = (buckets.length - 1 - i) % labelEvery === 0;
              const label = period === "recent" && i > 0 && b.start.getMonth() === buckets[i - 1].start.getMonth()
                ? format(b.start, "d")
                : bucketLabel(b);
              return (
                <div key={i} className={cn("h-4 whitespace-nowrap text-center leading-4", period === "recent" ? "min-w-0 flex-1" : "w-6 shrink-0")}>
                  {show && (
                    <span className={cn("text-[9px]", !recent && i === selIndex ? "text-accent font-bold" : "text-muted2")}>
                      {label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 表示項目の選択は切替ボタンから直接開く。 */}
      <div data-training-detail className="rounded-xl bg-bg p-3">
        <div className="space-y-1.5">
          <p className="text-caption">練習内容の表示</p>
          <SegmentedControl
            items={[
              { key: "specified", label: "項目選択" },
              { key: "all", label: "すべて表示" },
            ]}
            value={showAllFields ? "all" : "specified"}
            onChange={(key) => {
              setShowAllFields(key === "all");
              if (key === "specified") setFieldPickerOpen(true);
            }}
          />
        </div>
        <Sheet open={fieldPickerOpen} onOpenChange={setFieldPickerOpen}>
          <SheetContent title="練習内容の表示項目">
            <p className="mb-3 text-caption">この画面で見たい項目を選んでください。記録の内容や入力項目は変わりません。</p>
            <div className="space-y-1">
              {availableFields.map(field => <label key={field.key} className="flex min-h-11 items-center gap-3 rounded-xl px-3">
                <input type="checkbox" checked={effectiveFields.includes(field.key)} onChange={event => { setSelectedFields(event.target.checked ? [...effectiveFields, field.key] : effectiveFields.filter(key => key !== field.key)); setShowAllFields(false); }} className="h-5 w-5 accent-accent" />
                <span className="text-body">{field.label}</span>
              </label>)}
              {availableFields.length === 0 && <p className="text-caption">表示できる練習記録がありません。</p>}
            </div>
            <Button size="lg" className="mt-4" onClick={() => setFieldPickerOpen(false)}>完了</Button>
          </SheetContent>
        </Sheet>
        <Disclosure
          title="練習内容"
          open={showDetail}
          onOpenChange={setShowDetail}
          className="mt-3"
        >
          {sel.records.length === 0 ? (
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
                      {fields.map((field) => <KeyValue key={field.key} label={field.label} value={field.value} className="[&>dt]:[overflow-wrap:anywhere]" collapsible />)}
                    </dl>
                    {fields.length === 0 && (
                      <p className="text-caption">表示する内容はありません</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Disclosure>
      </div>
    </Card>
  );
}

function formatDistance(value: number): string {
  return formatKm(value);
}

function IntensitySummary({
  summary, period, label, previousTotal,
}: {
  summary: Bucket;
  period: Period;
  label: string;
  previousTotal: number;
}) {
  const difference = summary.total - previousTotal;
  const previousLabel = period === "recent" ? "その前の7日間" : period === "day" ? "前日" : period === "week" ? "先週" : "先月";
  const periodComparison = previousTotal === 0
    ? `${previousLabel}0km`
    : Math.abs(difference) < 0.05
      ? `${previousLabel}と同じ`
      : `${previousLabel}比 ${difference > 0 ? "+" : ""}${formatDistance(difference)}km`;
  const trainingDays = new Set(summary.records.filter((record) => displayedDistance(record) > 0).map((record) => record.recorded_date)).size;

  return (
    <div data-training-summary>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="whitespace-nowrap text-[12px] font-semibold">{label}</p>
        <p className="shrink-0 text-xl font-bold leading-6 tabular-nums">
          {formatDistance(summary.total)}
          <span className="ml-1 text-caption">km</span>
        </p>
      </div>
      <p className="mt-1 flex h-[18px] items-center gap-2 text-caption leading-[18px] tabular-nums">
        <span className="min-w-0 truncate" title={periodComparison}>{periodComparison}</span>
        <span className="shrink-0">走行{trainingDays}日</span>
      </p>

      <div
        className="mt-1 flex h-2 overflow-hidden rounded-full bg-separator/60"
        role="img"
        aria-label={summary.total > 0 ? "強度別の走行距離割合" : "走行距離は0kmです"}
      >
        {INTENSITY_ORDER.map((intensity) =>
          summary.by[intensity] > 0 ? (
            <div
              key={intensity}
              style={{
                width: `${(summary.by[intensity] / summary.total) * 100}%`,
                backgroundColor: INTENSITY_LABELS[intensity].color,
              }}
            />
          ) : null,
        )}
        {summary.unclassified > 0 && (
          <div aria-label={`その他 ${formatDistance(summary.unclassified)}km`} className="bg-muted/35" style={{ width: `${(summary.unclassified / summary.total) * 100}%` }} />
        )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {INTENSITY_ORDER.map((intensity) => {
          const value = summary.by[intensity];
          return (
            <div key={intensity} className="flex min-w-0 items-center gap-1 text-[11px]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: INTENSITY_LABELS[intensity].color }}
              />
              <span className="truncate text-muted2">{INTENSITY_LABELS[intensity].label}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted2">{formatDistance(value)}km</span>
            </div>
          );
        })}
        <div className="flex min-w-0 items-center gap-1 text-[11px]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-muted/35" />
          <span className="truncate text-muted2">その他</span>
          <span className="ml-auto shrink-0 tabular-nums text-muted2">{formatDistance(summary.unclassified)}km</span>
        </div>
      </div>
    </div>
  );
}
