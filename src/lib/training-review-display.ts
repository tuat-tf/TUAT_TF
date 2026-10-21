import { CONDITIONS, INTENSITY_LABELS } from "@/lib/constants";
import { format, subDays } from "date-fns";
import { BUILTIN_RECORD_FIELD_KEYS } from "@/lib/record-fields";
import { formatKm } from "@/lib/utils";
import type { TrainingRecord, RecordFieldDef } from "@/types";

/** Includes today and the preceding six JST calendar dates, never future records. */
export function recentTrainingRecords(records: TrainingRecord[], today: string): TrainingRecord[] {
  const from = format(subDays(new Date(`${today}T00:00:00`), 6), "yyyy-MM-dd");
  return records.filter(record => record.recorded_date >= from && record.recorded_date <= today);
}

/** A display preference shared by every training review for the viewer's account. */
export function trainingReviewPreferenceKey(viewerId: string): string {
  return `training-review-all-fields-${viewerId}`;
}

const BUILTIN_LABELS: Record<string, string> = {
  dist_low: INTENSITY_LABELS.low.label,
  dist_mid: INTENSITY_LABELS.mid.label,
  dist_high: INTENSITY_LABELS.high.label,
  dist_speed: INTENSITY_LABELS.speed.label,
  dist_actual: "実際の距離",
  strides: "流し",
  menu_text: "メニュー",
  focus_text: "目的・意識すること",
  result_text: "結果",
  strength_text: "補強",
  memo: "感想",
  condition: "コンディション",
};

export type TrainingReviewField = {
  key: string;
  label: string;
  value: string | number;
};

/** Match the existing card's historical-definition and legacy-setting rules. */
export function trainingReviewFields(
  record: TrainingRecord,
  currentFields: RecordFieldDef[],
  showAllFields: boolean,
): TrainingReviewField[] {
  const fields = record.record_fields_version != null
    ? record.record_fields_snapshot ?? []
    : currentFields;
  const hasDisplaySelection = fields.some((field) => typeof field.showInTimeline === "boolean");
  const definitions = new Map(fields.map((field) => [field.key, field]));
  // Preserve configured order and names, then retain stored fields whose old
  // definition is unavailable. An empty historical snapshot stays historical.
  const keys = [...new Set([
    ...fields.map((field) => field.key),
    ...BUILTIN_RECORD_FIELD_KEYS,
    ...Object.keys(record.custom ?? {}),
  ])];

  return keys.flatMap((key) => {
    const definition = definitions.get(key);
    if (!showAllFields && (hasDisplaySelection
      ? definition?.showInTimeline !== true || definition?.hidden === true
      : definition?.hidden === true || (!BUILTIN_RECORD_FIELD_KEYS.includes(key as typeof BUILTIN_RECORD_FIELD_KEYS[number]) && !definition))) {
      return [];
    }
    const builtin = BUILTIN_RECORD_FIELD_KEYS.includes(key as typeof BUILTIN_RECORD_FIELD_KEYS[number]);
    let value = builtin ? record[key as keyof TrainingRecord] : record.custom?.[key];
    if (value === null || value === undefined || value === "" || (typeof value === "string" && !value.trim())) return [];
    // Legacy cards omit unentered numeric defaults. Explicit selections and
    // all-fields mode preserve zero, as do custom values whose definition moved.
    if (builtin && typeof value === "number" && value === 0 && !showAllFields && definition?.showInTimeline !== true) return [];
    if (key === "condition") {
      const condition = record.condition ? CONDITIONS[record.condition] : null;
      value = condition ? `${condition.symbol} ${condition.label}` : value;
    } else if (builtin && key.startsWith("dist_") && typeof value === "number") {
      value = `${formatKm(value)}km`;
    } else if (key === "strides" && typeof value === "number") {
      value = `${value}本`;
    }
    if (typeof value !== "string" && typeof value !== "number") return [];
    const fallback = key === "result_text" && (record.menu_text || record.focus_text) ? "タイム" : BUILTIN_LABELS[key];
    return [{ key, label: definition?.label?.trim() || fallback || key, value }];
  });
}
