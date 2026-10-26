"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { VenueRow } from "@/types";

// 予定の「集合時間」「場所」欄。1か月まとめて入力（MonthlyPlanningEditorV2）と
// 1件ずつの入力（ScheduleForm）で同じ部品・同じ選び方にそろえる。

const TIME_PRESETS = ["09:00", "17:00"];
const OTHER = "__other__";

/** 集合時間。よく使う時刻はそのまま選び、それ以外は「その他」で入力する。 */
export function MeetingTimeField({ value, onChange, allowEmpty = false }: {
  value: string;
  onChange: (value: string) => void;
  /** 「なし」を選べるようにする（1件ずつの入力。まとめて入力では空欄＝未入力）。 */
  allowEmpty?: boolean;
}) {
  const [otherChosen, setOtherChosen] = useState(false);
  const custom = otherChosen || (!!value && !TIME_PRESETS.includes(value));
  return (
    <div>
      <p className="section-label mb-1.5">集合時間</p>
      <Select
        ariaLabel="集合時間"
        value={custom ? OTHER : value}
        onValueChange={(next) => {
          setOtherChosen(next === OTHER);
          onChange(next === OTHER ? (TIME_PRESETS.includes(value) ? "" : value) : next);
        }}
        placeholder="時間を選択"
        options={[
          ...(allowEmpty ? [{ value: "", label: "なし" }] : []),
          ...TIME_PRESETS.map((time) => ({ value: time, label: time.replace(/^0/, "") })),
          { value: OTHER, label: "その他" },
        ]}
      />
      {custom && <Input className="mt-2" type="time" aria-label="集合時間を入力" value={value} onChange={(event) => onChange(event.target.value)} />}
    </div>
  );
}

/** 場所。登録済みの場所から選び、それ以外は「その他」で入力する。値は場所名。 */
export function VenueField({ venues, value, onChange, label = "場所", allowEmpty = false }: {
  venues: VenueRow[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  allowEmpty?: boolean;
}) {
  const [otherChosen, setOtherChosen] = useState(false);
  const known = venues.some((venue) => venue.name === value);
  const custom = otherChosen || (!!value && !known);
  return (
    <div>
      <p className="section-label mb-1.5">{label}</p>
      <Select
        ariaLabel={label}
        value={custom ? OTHER : value}
        onValueChange={(next) => {
          setOtherChosen(next === OTHER);
          onChange(next === OTHER ? (known ? "" : value) : next);
        }}
        placeholder="場所を選択"
        options={[
          ...(allowEmpty ? [{ value: "", label: "選択しない" }] : []),
          ...venues.map((venue) => ({ value: venue.name, label: venue.name })),
          { value: OTHER, label: "その他" },
        ]}
      />
      {custom && <Input className="mt-2" placeholder="場所名を入力" value={value} onChange={(event) => onChange(event.target.value)} />}
    </div>
  );
}

/** 登録済みの場所なら、アクセス・参加費・地図も予定に写す（どちらの入力でも同じ）。 */
export function venueDetails(venues: VenueRow[], name: string | null) {
  const venue = name ? venues.find((item) => item.name === name) : undefined;
  return { venue_access: venue?.access ?? null, venue_fee: venue?.fee ?? null, venue_url: venue?.url ?? null };
}
