import { MeetEvent } from "./meet-operations";
import { compareObEvents } from "./ob-entry-edit";
import { obAppearanceName, type ObEntry } from "./ob-entries";
import { OB_PROGRAM, obFamilyLabel } from "./ob-meet";
import { obFamilyRows, obMixedGroupLabel } from "./ob-mixed-operations";
import { obEventRule, type ObEventOperation } from "./ob-operations";
import type { TableCell, TableSheet } from "./export-table";
import { obResultRanks } from "./ob-result-ranking";

type Row = ReturnType<typeof obFamilyRows>[number];
export type ObHeatLabels = Record<string, Record<number, string>>;

/** Events in program order, from registrations and saved operations alike. */
export function obResultFamilies(entries: ObEntry[], operations: ObEventOperation[]): string[] {
  const events = [...new Set([...entries.flatMap(entry => entry.events), ...operations.map(operation => operation.event_name)])].sort(compareObEvents);
  return [...new Set(events.map(event => event.replace(/^(男子|女子)/, "")))];
}

/** The timetable first, then one start list per event. Qualification marks are not exported. */
export function obResultSheets(entries: ObEntry[], operations: ObEventOperation[], heatLabels:ObHeatLabels={}): TableSheet[] {
  return [obProgramSheet(), ...obResultFamilies(entries, operations).map(family => obResultSheet(family, entries, operations, false, heatLabels[family]))];
}

export function obProgramSheet(): TableSheet {
  return { name: "プログラム", widths: [8, 34, 14], rows: [["時刻", "内容", "備考"], ...OB_PROGRAM.map(slot => [slot.time, slot.label, slot.note ?? ""])] };
}

/** Fixed public workbook: attendance and withdrawals stay visible after later app edits. */
export function obPublishedResultSheets(entries: ObEntry[], operations: ObEventOperation[], heatLabels:ObHeatLabels={}): TableSheet[] {
  return [obProgramSheet(), ...OB_PROGRAM.flatMap(slot => slot.events).map(family => obResultSheet(family, entries, operations, true, heatLabels[family]))];
}

/**
 * Start list sent to alumni: only people who compete or already have a result, without internal status columns.
 * Record columns appear once the event has a result, so a pre-meet sheet is just the start list.
 */
export function obResultSheet(family: string, entries: ObEntry[], operations: ObEventOperation[], published = false, heatLabels?:Record<number,string>): TableSheet {
  const rule = obEventRule(family), rows = obFamilyRows(family, entries, operations).filter(row => published || row.state.canParticipate || row.state.recorded);
  const recorded = rows.some(row => row.state.recorded);
  const results = published || recorded;
  const personHeaders = ["区分", "氏名", "学年", ...(published ? ["出場状況"] : [])];
  const personWidths = [6, 18, 7, ...(published ? [18] : [])];
  const person = (row: Row): TableCell[] => [row.division, obAppearanceName(row.entry, row.eventName, row.entryId), row.entry?.grade ?? "",
    ...(published ? [publishedParticipation(row)] : [])];
  const best = (row: Row) => row.state.recorded ? new MeetEvent(obEventRule(row.eventName), { participants: [row.performance], confirmed: false }).best(row.performance.status === "DNS" ? { ...row.performance, status: "entered" } : row.performance) : "";
  const name = obFamilyLabel(family);
  const ranks = new Map(["男子", "女子"].flatMap(division => [...obResultRanks(rule,
    rows.filter(row => row.division === division && row.state.canParticipate).map(row => row.performance))]));
  // Ranks are per division even in mixed heats, so the cell says which (男子1位 / 女子1位).
  const rankText = (row: Row): TableCell => { const rank = ranks.get(row.performance.entryId); return rank === undefined ? "" : `${row.division}${rank}位`; };
  const ranked = (sheet: TableSheet): TableSheet => {
    if (!results) return sheet;
    let personIndex = 0;
    return { ...sheet, widths: [...sheet.widths!, 9], rows: sheet.rows.map((line, index) =>
      !index ? [...line, "順位（男女別）"] : !line.length ? line : [...line, rankText(rows[personIndex++])]) };
  };

  if (rule.discipline === "track") {
    const lanes = !["1500m", "3000m"].includes(family);
    const result = (row: Row): TableCell[] => results ? [best(row)] : [];
    const lines: TableCell[][] = [["組", ...(lanes ? ["レーン"] : []), ...personHeaders, ...(results ? ["記録"] : [])]];
    let heat: string | undefined;
    for (const row of rows) {
      const label = row.group === null ? "" : heatLabels?.[row.group] ?? obMixedGroupLabel(row.group);
      // The heat is named once on its first line; a blank line separates heats.
      if (heat !== undefined && label !== heat) lines.push([]);
      lines.push([label === heat ? null : label, ...(lanes ? [row.group === null ? null : row.performance.order] : []), ...person(row), ...result(row)]);
      heat = label;
    }
    return ranked({ name, widths: [10, ...(lanes ? [7] : []), ...personWidths, ...(results ? [10] : [])], rows: lines });
  }

  // OB field events record one mark per athlete, so the sheet has a single 記録 column (no attempt columns).
  const order = (row: Row): TableCell => row.number ?? "";
  return ranked({ name, widths: [8, ...personWidths, ...(results ? [10] : [])], rows: [
    ["試技順", ...personHeaders, ...(results ? ["記録"] : [])],
    ...rows.map(row => [order(row), ...person(row), ...(results ? [best(row)] : [])]),
  ] });
}

/** Meet attendance is separate from the event declaration; saved marks never disappear. */
function publishedParticipation(row: Row): string {
  return row.state.status === "entered" ? "出場" : row.state.status === "DNF" ? "DNF（途中棄権）" : row.state.status === "DQ" ? "DQ（失格）" : "DNS（欠場）";
}

/** JST timestamp keeps successive exports on the meet day apart. */
export function obResultsFileName(now: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map(part => [part.type, part.value]));
  return `OB戦_組・記録_${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}.xlsx`;
}
