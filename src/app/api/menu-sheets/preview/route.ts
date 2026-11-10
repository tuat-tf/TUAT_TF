import { NextResponse } from "next/server";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { fetchRolesByProfileIds } from "@/lib/supabase/auth";
import { permissionsOf } from "@/lib/permissions";
import { fetchGoogleCsv, GoogleCsvFetchError, isSafeGoogleCsvUrl } from "@/lib/google-csv-fetch";
import {
  canonicalMenuImportValues,
  requiredMenuImportHeaders,
  validateMenuImportRows,
  type SubmittedMenuRow,
} from "@/lib/menu-import";
import { normalizeImportValues } from "@/lib/schedule-import";
import type { Block, PracticeMenu, PracticeSchedule } from "@/types";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_CSV_BYTES = 5 * 1024 * 1024;
const CSV_TIMEOUT_MS = 10_000;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let roles;
  try {
    roles = (await fetchRolesByProfileIds(supabase, [user.id])).get(user.id);
  } catch (error) {
    console.error("menu-sheets/preview: failed to load roles", error);
    return NextResponse.json({ error: "権限を確認できませんでした。もう一度お試しください" }, { status: 503 });
  }
  if (!permissionsOf(roles).createMenu) {
    return NextResponse.json({ error: "メニューを取り込む権限がありません" }, { status: 403 });
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "リクエストが大きすぎます" }, { status: 413 });
  }
  const rawBody = await request.text().catch(() => null);
  if (rawBody === null) {
    return NextResponse.json({ error: "リクエストを読み取れませんでした" }, { status: 400 });
  }
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "リクエストが大きすぎます" }, { status: 413 });
  }
  let body: {
    year?: number;
    targetBlock?: Block;
    sheetUrl?: string;
    csv?: string;
    rows?: SubmittedMenuRow[];
  };
  try {
    const parsedBody = JSON.parse(rawBody);
    if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) throw new Error("not object");
    body = parsedBody;
  } catch {
    return NextResponse.json({ error: "リクエストの形式が正しくありません" }, { status: 400 });
  }
  const year = Number(body.year);
  const targetBlock = body.targetBlock;
  if (!year || !targetBlock) {
    return NextResponse.json({ error: "対象年とブロックを指定してください" }, { status: 400 });
  }

  let rows: SubmittedMenuRow[];
  const editedRows = Array.isArray(body.rows);
  if (editedRows) {
    rows = body.rows!.map((row, index) => ({
      rowNumber: Number.isInteger(row.rowNumber) ? row.rowNumber : index + 2,
      values: normalizeImportValues(row.values),
    }));
  } else {
    const csvResult = await loadCsv(body.sheetUrl, body.csv);
    if ("error" in csvResult) {
      return NextResponse.json({ error: csvResult.error }, { status: csvResult.status });
    }
    const parsed = Papa.parse<Record<string, string>>(csvResult.csv, {
      header: true,
      skipEmptyLines: false,
      transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
    });
    if (parsed.errors.some((error) => error.type === "Quotes")) {
      return NextResponse.json(
        { error: "CSVの引用符が正しく閉じられていません" },
        { status: 400 },
      );
    }
    const headers = parsed.meta.fields ?? [];
    const missing = requiredMenuImportHeaders().filter(
      (choices) => !choices.some((header) => headers.includes(header)),
    );
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `必要な列がありません: ${missing
            .map((choices) => choices.join(" または "))
            .join("、")}`,
        },
        { status: 400 },
      );
    }
    rows = parsed.data.map((raw, index) => ({
      rowNumber: index + 2,
      values: canonicalMenuImportValues(raw),
    }));
  }

  const start = `${year - 1}-12-01`;
  const end = `${year + 1}-02-01`;
  const { data: scheduleData, error: scheduleError } = await supabase
    .from("practice_schedules")
    .select("*")
    .eq("schedule_type", "practice")
    .gte("schedule_date", start)
    .lt("schedule_date", end);
  if (scheduleError) {
    console.error("menu-sheets/preview: failed to read schedules", scheduleError);
    return NextResponse.json({ error: "予定を読み込めませんでした。もう一度お試しください" }, { status: 503 });
  }
  const schedules = (scheduleData ?? []) as PracticeSchedule[];
  const scheduleIds = schedules.map((schedule) => schedule.id);

  let menus: PracticeMenu[] = [];
  if (scheduleIds.length > 0) {
    const { data: menuData, error: menuError } = await supabase
      .from("practice_menus")
      .select("*, targets:practice_menu_targets(menu_id, user_id)")
      .in("schedule_id", scheduleIds);
    if (menuError) {
      console.error("menu-sheets/preview: failed to read menus", menuError);
      return NextResponse.json({ error: "メニューを読み込めませんでした。もう一度お試しください" }, { status: 503 });
    }
    menus = (menuData ?? []) as PracticeMenu[];
  }

  return NextResponse.json(
    validateMenuImportRows({
      rows,
      defaultYear: year,
      defaultBlock: targetBlock,
      schedules,
      menus,
    }),
  );
}

async function loadCsv(
  sheetUrl?: string,
  uploadedCsv?: string,
): Promise<{ csv: string } | { error: string; status: number }> {
  if (uploadedCsv) return { csv: uploadedCsv };
  if (!sheetUrl?.trim()) {
    return { error: "GoogleスプレッドシートのURLかCSVファイルを指定してください", status: 400 };
  }
  let csvUrl: URL;
  try {
    csvUrl = googleSheetCsvUrl(sheetUrl.trim());
  } catch {
    return { error: "GoogleスプレッドシートのURLが不正です", status: 400 };
  }
  try {
    return { csv: await fetchGoogleCsv(csvUrl, { timeoutMs: CSV_TIMEOUT_MS, maxBytes: MAX_CSV_BYTES }) };
  } catch (error) {
    if (error instanceof GoogleCsvFetchError && error.kind === "too_large") {
      return { error: "スプレッドシートが大きすぎます（5MBまで）", status: 413 };
    }
    return {
      error: "スプレッドシートを読み込めませんでした。共有設定を確認してください",
      status: 502,
    };
  }
}

function googleSheetCsvUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("unsupported url");
  }
  if (!["docs.google.com", "docs.googleusercontent.com"].includes(url.hostname)) {
    throw new Error("unsupported host");
  }
  if (
    url.searchParams.get("output") === "csv" ||
    url.searchParams.get("format") === "csv"
  ) {
    if (!isSafeGoogleCsvUrl(url)) throw new Error("unsupported url");
    return url;
  }
  const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) throw new Error("sheet id not found");
  const gid =
    url.searchParams.get("gid") ?? url.hash.match(/gid=(\d+)/)?.[1] ?? "0";
  return new URL(
    `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`,
  );
}
