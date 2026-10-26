import { lookup } from "node:dns/promises";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchRolesByProfileIds } from "@/lib/supabase/auth";
import { permissionsOf } from "@/lib/permissions";
import { timingSafeEqualString } from "@/lib/timing-safe";
import { forwardPcCron } from "@/lib/pc-cron-forward";
import { decodeShiftJisHtml, parseCompetitionProgram, reconcileProgramEntries, validateProgramImport, fromStoredProgramRow, type ParsedProgramRow } from "@/lib/competition-program";
import { isNansProgramPage, nansRounds, nansRoundUrl, parseNansProgram } from "@/lib/competition-program-nans";
import type { CompetitionProgramEntryRow } from "@/types";
import type { Json } from "@/types/database";
import { isCompetitionArchived } from "@/lib/competition-lifecycle";

export async function GET(request: Request) { return forwardPcCron(request, POST); }

export const maxDuration = 180;

/**
 * 大会プログラム（速報サイトのタイムテーブル）を取り込む。
 * 認可: 記録・予定の同期と同じ二系統（pg_cron/Vercel Cron の Bearer、またはシステム管理者の手動実行）。
 * competitions.program_source_url を設定した大会だけが対象。完全なページだけを検証し、DB関数の単一トランザクションで入れ替える。
 * 1件が取得・解析に失敗しても他の大会の取込は止めない。
 */
/**
 * The results host sometimes takes over 10s to accept a connection (Node's connect timeout), then answers
 * at once. Connection-level failures are retried; HTTP errors are not.
 */
async function fetchSource(url: URL): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      // The PC's resolver stalls ~15s on this host's AAAA query; an IPv4-only lookup answers at once.
      // Plain HTTP only (the site has no working TLS), so connecting to the address with a Host header is exact.
      const target = url.protocol === "http:" ? new URL(url) : url;
      if (url.protocol === "http:") target.hostname = (await lookup(url.hostname, { family: 4 })).address;
      const response = await fetch(target, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(20000),
        ...(target !== url ? { headers: { host: url.host } } : {}) });
      if (!response.ok) throw Object.assign(new Error(`取得に失敗しました（${response.status}）`), { final: true });
      return response;
    } catch (error) {
      if ((error as { final?: boolean }).final || attempt >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * attempt));
    }
  }
}

async function fetchJson(url: URL): Promise<unknown> {
  return JSON.parse((await (await fetchSource(url)).text()).replace(/^﻿/, ""));
}

/** New-format (JSON) source: the timetable plus one page per round, a few at a time. Any failure keeps the previous program. */
async function readNansProgram(url: URL, startsOn: string, endsOn: string | null, previousCount: number): Promise<ParsedProgramRow[]> {
  const timetable = await fetchJson(new URL("TimeTable.json", url));
  const links = nansRounds(timetable).map(round => round.link);
  const pages = new Map<string, unknown>();
  for (let i = 0; i < links.length; i += 8) {
    const batch = links.slice(i, i + 8);
    const values = await Promise.all(batch.map(link => fetchJson(nansRoundUrl(url, link))));
    batch.forEach((link, index) => pages.set(link, values[index]));
  }
  const rows = parseNansProgram(timetable, pages, startsOn, endsOn);
  if (rows.length < previousCount * 0.8) throw new Error("取得ページが不完全なため、前回のプログラムを保持しました");
  if (new Set(rows.map(r => `${r.eventDate}/${r.block}/${r.roundKey}`)).size !== rows.length) throw new Error("プログラムの種目が重複しています");
  return rows;
}

export async function POST(request: Request) {
  const secret = process.env.SHEET_SYNC_SECRET;
  const authHeader = request.headers.get("authorization") ?? "";
  const isCron = Boolean(secret) && timingSafeEqualString(authHeader, `Bearer ${secret}`);
  if (!isCron) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    const rolesMap = await fetchRolesByProfileIds(supabase, [user.id]);
    if (!permissionsOf(rolesMap.get(user.id)).manageSystem) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const onlyCompetitionId = typeof body?.competitionId === "string" ? body.competitionId : undefined;

  const admin = createAdminClient();
  let query = admin
    .from("competitions")
    .select("id,starts_on,ends_on,program_source_url,program_closed_at,archive_at")
    .not("program_source_url", "is", null);
  if (onlyCompetitionId) query = query.eq("id", onlyCompetitionId);
  const { data: competitions, error: competitionsError } = await query;
  if (competitionsError) {
    return NextResponse.json({ ok: false, error: competitionsError.message }, { status: 500 });
  }

  const results: { competitionId: string; ok: boolean; rows?: number; entries?: number; error?: string }[] = [];

  for (const competition of competitions ?? []) {
    // 速報の取得を終了した大会は自動では取りに行かない（指定した手動取得はできる）。
    if (!onlyCompetitionId && (isCompetitionArchived(competition) || competition.program_closed_at)) continue;
    const sourceUrl = competition.program_source_url;
    if (!sourceUrl) continue;
    try {
      const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
      const start = Date.parse(competition.starts_on);
      const end = Date.parse(competition.ends_on ?? competition.starts_on);
      const now = Date.parse(today);
      // 日本時間の開催前日〜終了翌日だけ自動取得する。指定大会の手動取得は継続可能。
      if (!onlyCompetitionId && (start > now + 86400000 || end < now - 86400000)) continue;
      const url = new URL(sourceUrl);
      if (url.hostname !== "sairiku.net" || !/^https?:$/.test(url.protocol) || !url.pathname.startsWith("/result/") || url.username || url.password || url.port) throw new Error("対応していない取得元URLです");
      const response = await fetchSource(url);
      const bytes = await response.arrayBuffer();
      const { data: previous, error: readError } = await admin.from("competition_program_entries").select("*").eq("competition_id", competition.id);
      if (readError) throw readError;
      let parsed: ParsedProgramRow[];
      if (isNansProgramPage(new TextDecoder().decode(bytes))) {
        parsed = await readNansProgram(url, competition.starts_on, competition.ends_on, previous?.length ?? 0);
      } else {
        const html = decodeShiftJisHtml(bytes);
        parsed = parseCompetitionProgram(html, new Date(competition.starts_on).getFullYear());
        validateProgramImport(html, parsed, previous?.length ?? 0);
      }
      const rows = reconcileProgramEntries(parsed, ((previous ?? []) as unknown as CompetitionProgramEntryRow[]).map(fromStoredProgramRow));
      const stored = rows.map(row => ({ event_date: row.eventDate, block: row.block, sort_order: row.sortOrder,
        time_label: row.timeLabel, round_key: row.roundKey, event_label: row.eventLabel, status: row.status,
        tuat_entries: row.tuatEntries }));
      if (!body?.dryRun) {
        const { error: writeError } = await admin.rpc("replace_competition_program", { target_competition_id: competition.id, program_rows: stored as unknown as Json });
        if (writeError) throw writeError;
      }

      const entries = rows.reduce((sum, row) => sum + row.tuatEntries.length, 0);
      results.push({ competitionId: competition.id, ok: true, rows: rows.length, entries });
    } catch (error) {
      const message = error instanceof Error ? error.message : "取込できませんでした";
      results.push({ competitionId: competition.id, ok: false, error: message });
    }
  }

  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
