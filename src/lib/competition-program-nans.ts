// 速報サイトの新しい形式（Nans21v）。ページはAngularの枠だけで、中身は同じ場所のJSONにある。
//   shtml/TimeTable.json            … 種目・組・開始時刻と、ラウンドごとの結果ページへのリンク
//   shtml/result/<種類>/<名前>.json … ラウンドごとのスタートリスト・結果（ページの .html を .json にしたもの）
// 既存の静的HTML版（parseCompetitionProgram）と同じ ParsedProgramRow を返し、表示・保存は共通のまま使う。

import type { ParsedProgramRow, ProgramAthlete, ProgramBlock } from "./competition-program";
import { isNonMarkResult } from "./competition-program";

const TUAT = "農工大";

export function isNansProgramPage(html: string): boolean {
  return /ng-app=["']Nans21vApp["']/.test(html);
}

type TimetableRow = { No?: string; KaishiJikan?: string; KyogiBasho?: string; KyogiMei?: string; Round?: string; Kumi?: string; KyogiKekka?: string; LinkRound?: string };
type Round = { link: string; key: string; source: string; time: string; block: ProgramBlock; label: string; kumi: Set<string>; status: string; order: number };

const text = (value: unknown) => typeof value === "string" ? value.normalize("NFKC").replace(/\s+/g, " ").trim() : "";

/** Every round of the meet, once each. The timetable repeats rows under several filter views (種目別・男女別). */
export function nansRounds(timetable: unknown): Round[] {
  const list = (timetable as { TimeTableList?: Record<string, Record<string, Record<string, { TimeTable?: TimetableRow[] }>>> })?.TimeTableList;
  if (!list || typeof list !== "object") throw new Error("速報サイトの種目一覧を読めませんでした");
  const rounds = new Map<string, Round>();
  for (const [source, views] of Object.entries(list)) {
    if (!/^\d{8}$/.test(source)) throw new Error("速報サイトの日付を読めませんでした");
    for (const sexes of Object.values(views ?? {})) for (const view of Object.values(sexes ?? {})) for (const row of view?.TimeTable ?? []) {
      const link = typeof row.LinkRound === "string" ? row.LinkRound.replace(/#.*$/, "") : "";
      if (!/^\.\/result\/[a-z]+\/[\w-]+\.html$/.test(link)) continue;
      const existing = rounds.get(link);
      if (existing) { if (row.Kumi) existing.kumi.add(row.Kumi); continue; }
      const time = text(row.KaishiJikan);
      rounds.set(link, {
        link, key: link.replace(/^.*\/|\.html$/g, ""), source, time: /^\d{1,2}:\d{2}$/.test(time) ? time.padStart(5, "0") : "",
        block: text(row.KyogiBasho) === "トラック" ? "track" : "field",
        // 「4X100mR」→「4×100mR」: relays are recognised by "×" elsewhere (reconcile, result grouping).
        label: [text(row.KyogiMei).replace(/(\d)[xX×](\d)/g, "$1×$2"), text(row.Round).replace(/\s/g, "")].filter(Boolean).join(" "),
        kumi: new Set(row.Kumi ? [row.Kumi] : []), status: text(row.KyogiKekka), order: Number(row.No) || 0,
      });
    }
  }
  if (!rounds.size) throw new Error("取得ページが不完全なため、前回のプログラムを保持しました");
  return [...rounds.values()];
}

/** The JSON beside a round page (same directory, .html → .json), never another host or path. */
export function nansRoundUrl(pageUrl: URL, link: string): URL {
  const url = new URL(link.replace(/\.html$/, ".json"), pageUrl);
  const base = new URL(".", pageUrl);
  if (url.origin !== pageUrl.origin || !url.pathname.startsWith(base.pathname)) throw new Error("対応していない取得元URLです");
  return url;
}

/** Kanji name after the kana reading, without the trailing (B3) grade. */
function person(raw: unknown): { name: string; grade: string } | null {
  if (typeof raw !== "string") return null;
  const kanji = text(raw.split(/<br\s*\/?>/i).pop()?.replace(/<[^>]*>/g, ""));
  const grade = kanji.match(/[（(]\s*([^）)]+?)\s*[）)]\s*$/)?.[1] ?? "";
  const name = kanji.replace(/[（(][^）)]*[）)]\s*$/, "").trim();
  return name ? { name, grade: /^\d+$/.test(grade) ? `B${grade}` : grade } : null;
}

function affiliation(row: Record<string, unknown>): string {
  return text(String(row.Shozoku ?? row.ShozokuMei ?? "").split(/<br\s*\/?>/i)[0]);
}

function windOf(row: Record<string, unknown>, heatStatus: string): string | undefined {
  for (const [key, value] of Object.entries(row)) if (/kaze|fusoku|wind/i.test(key) && /^[+-]?\d+\.\d$/.test(text(value))) return text(value);
  return heatStatus.match(/([+-]\d+\.\d)/)?.[1];
}

function resultOf(row: Record<string, unknown>, heatStatus: string): ProgramAthlete["result"] | undefined {
  const record = row.DnsFlg === "1" ? "欠場" : text(String(row.Kiroku ?? "").replace(/<[^>]*>/g, " "));
  if (!record) return undefined;
  const blank = isNonMarkResult(record), place = text(row.Jyuni), wind = blank ? undefined : windOf(row, heatStatus);
  return { place: !blank && /^\d+$/.test(place) ? place : null, record, ...(wind ? { wind } : {}) };
}

/** TUAT appearances in one round page, whatever its shape (track/relay/jump/throw, paged result lists). */
export function nansRoundEntries(round: unknown, block: ProgramBlock): ProgramAthlete[] {
  const entries: ProgramAthlete[] = [], seen = new Set<string>();
  const visit = (node: unknown, heat: number | null, status: string) => {
    if (Array.isArray(node)) { for (const item of node) visit(item, heat, status); return; }
    if (!node || typeof node !== "object") return;
    const row = node as Record<string, unknown>;
    if (typeof row.Status === "string" && /(\d+)\s*組/.test(row.Status)) { heat = Number(row.Status.match(/(\d+)\s*組/)![1]); status = row.Status; }
    if ((typeof row.Shozoku === "string" || typeof row.ShozokuMei === "string") && affiliation(row).startsWith(TUAT)) {
      const id = `${heat}|${text(row.No) || text(row.Team) || text(row.Kyogisha) || text(row.KyogishaMei)}`;
      if (seen.has(id)) return;
      seen.add(id);
      const lane = Number(block === "track" ? row.Lane : row.Shigi);
      const base = { heat, lane: Number.isInteger(lane) && lane > 0 ? lane : null, bib: text(row.No) || null };
      const result = resultOf(row, status);
      const members = Array.isArray(row.TeamMember) ? row.TeamMember.map(m => person(m && typeof m === "object" ? Object.values(m as object).find(v => typeof v === "string" && /<br/i.test(v)) ?? (m as Record<string, unknown>).Kyogisha : m)).filter(Boolean) as { name: string; grade: string }[] : [];
      const team = "Team" in row ? { name: text(row.TeamTitle) || affiliation(row), grade: "" } : null;
      const people = members.length ? members : team ? [team] : [person(row.Kyogisha ?? row.KyogishaMei)].filter(Boolean) as { name: string; grade: string }[];
      for (const who of people) entries.push({ ...base, ...who, ...(team && members.length ? { bib: null } : {}), ...(result ? { result } : {}) });
      return;
    }
    for (const value of Object.values(row)) if (value && typeof value === "object") visit(value, heat, status);
  };
  const page = round as Record<string, unknown>;
  const info = Object.entries(page ?? {}).filter(([key]) => /^ResultInfo\d*$/.test(key));
  if (!info.length) throw new Error("速報サイトの組・結果を読めませんでした");
  for (const [, value] of info) visit(value, null, "");
  return entries;
}

/**
 * Program rows for the competition's own dates. The site's internal date keys can differ from the meet day
 * (理工系2026は9/8のまま公開), so the n-th source day maps to the n-th day of the competition.
 */
export function parseNansProgram(timetable: unknown, pages: Map<string, unknown>, startsOn: string, endsOn: string | null): ParsedProgramRow[] {
  const rounds = nansRounds(timetable);
  const sources = [...new Set(rounds.map(r => r.source))].sort();
  const start = Date.parse(`${startsOn}T00:00:00Z`), days = Math.round((Date.parse(`${endsOn ?? startsOn}T00:00:00Z`) - start) / 86400000) + 1;
  if (sources.length > days) throw new Error("速報サイトの日数が大会日程と一致しません");
  const dateOf = (source: string) => new Date(start + sources.indexOf(source) * 86400000).toISOString().slice(0, 10);
  const sorted = rounds.sort((a, b) => a.source.localeCompare(b.source) || a.time.localeCompare(b.time) || a.order - b.order);
  const counters = new Map<string, number>();
  return sorted.map(round => {
    const page = pages.get(round.link);
    if (page === undefined) throw new Error("取得ページが不完全なため、前回のプログラムを保持しました");
    const date = dateOf(round.source), counter = `${date}/${round.block}`;
    counters.set(counter, (counters.get(counter) ?? 0) + 1);
    // Several heats in one timed round: the label carries the count so a heat place reads as 「1着」, not 「1位」.
    const label = round.kumi.size > 1 ? `${round.label}(${round.kumi.size}組)` : round.label;
    return { eventDate: date, block: round.block, sortOrder: counters.get(counter)!, timeLabel: round.time || null,
      roundKey: round.key, eventLabel: label, status: round.status || null, tuatEntries: nansRoundEntries(page, round.block) };
  });
}
