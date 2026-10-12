import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { createClient } from "@/lib/supabase/client";
import { jstToday } from "@/lib/date";
import { createExistingRows, createTemplateRows, toRpcRow } from "./schedule-sheet-data";
import type { PracticeSchedule, ScheduleImportEditableRow, ScheduleImportPreview, ScheduleSheetBlock, ScheduleSheetKind } from "@/types";

/** 予定シートの取得・下書き・確認・反映。呼出元のマウントごとに1つだけ使う。 */
export function useScheduleSheetImport() {
  const router = useRouter();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [kind, setKind] = useState<ScheduleSheetKind>("practice");
  const [block, setBlock] = useState<ScheduleSheetBlock>("all");
  const [inputMode, setInputMode] = useState<"new" | "edit">("new");
  const [existing, setExisting] = useState<PracticeSchedule[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [source, setSource] = useState<"url" | "file">("url");
  const [sheetUrl, setSheetUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState("");
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScheduleImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastApplied, setLastApplied] = useState<PracticeSchedule[]>([]);
  const [undoing, setUndoing] = useState(false);
  const [deletionIds, setDeletionIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [existingError, setExistingError] = useState<string | null>(null);
  const [existingLoading, setExistingLoading] = useState(true);
  const [readVersion, setReadVersion] = useState(0);
  const [uncertainOperation, setUncertainOperation] = useState<"apply" | "delete" | null>(null);
  const existingScope = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const supabase = createClient();
        let query = supabase
          .from("practice_schedules")
          .select("*")
          .eq("schedule_type", kind)
          .order("schedule_date", { ascending: true });
        if (kind === "practice") {
          const start = `${year}-${String(month).padStart(2, "0")}-01`;
          const nextMonth =
            month === 12
              ? `${year + 1}-01-01`
              : `${year}-${String(month + 1).padStart(2, "0")}-01`;
          query = query.gte("schedule_date", start).lt("schedule_date", nextMonth);
        } else {
          query = query.gte("schedule_date", jstToday());
        }
        const { data, error: readError } = await query;
        if (readError || !data) throw new Error("Schedules unavailable");
        if (!active) return;
        const targetBlocks = block === "all" ? [] : [block];
        const filteredExisting = (data as PracticeSchedule[]).filter(
          (schedule) =>
            [...(schedule.target_blocks ?? [])].sort().join(",") ===
            [...targetBlocks].sort().join(","),
        );
        setExisting(filteredExisting);
        const scope = `${kind}:${block}:${year}:${month}`;
        const ids = filteredExisting.map((schedule) => schedule.id);
        // 条件変更は全選択、再読込では利用者の選択を保つ。
        if (existingScope.current === scope) setSelectedIds((selected) => selected.filter((id) => ids.includes(id)));
        else setSelectedIds(ids);
        existingScope.current = scope;
      } catch {
        if (active) setExistingError("予定を読み込めませんでした。もう一度読み込んでください");
      } finally {
        if (active) setExistingLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [block, kind, month, year, readVersion]);

  function downloadTemplate() {
    if (inputMode === "edit" && (existingLoading || existingError)) return;
    const selected = existing.filter((schedule) => selectedIds.includes(schedule.id));
    const rows =
      inputMode === "edit"
        ? createExistingRows(selected, kind, block)
        : createTemplateRows(year, month, kind, block);
    const content = `\uFEFF${Papa.unparse(rows)}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      kind === "practice"
        ? `${year}-${String(month).padStart(2, "0")}-practice-${block}.csv`
        : `${kind}-${block}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function selectFile(file: File | undefined) {
    if (!file) return;
    try {
      const content = await file.text();
      setFileName(file.name);
      setCsv(content);
      setSheetId(null);
      setPreview(null);
      setError(null);
    } catch {
      setError("CSVファイルを読み込めませんでした。もう一度選択してください");
    }
  }

  async function previewImport() {
    if (loading || applying) return;
    if (source === "url" && !sheetUrl.trim()) {
      setError("Googleスプレッドシートの共有URLを入力してください");
      return;
    }
    if (source === "file" && !csv) {
      setError("CSVファイルを選択してください");
      return;
    }
    setLoading(true);
    setError(null);
    let creatingRecord = false;
    try {
      const supabase = createClient();
      let targetSheetId = sheetId;
      if (!targetSheetId) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
          setError("ログインを確認できませんでした。時間をおいて、もう一度お試しください");
          return;
        }
        // 応答を受け取れなくても同じIDを読み直し、管理行を無条件に再作成しない。
        targetSheetId = crypto.randomUUID();
        setSheetId(targetSheetId);
        creatingRecord = true;
        const { data, error: createError } = await supabase
          .from("schedule_sheets")
          .insert({
            id: targetSheetId,
            author_id: user.id,
            target_year: kind === "practice" ? year : null,
            target_month: kind === "practice" ? month : null,
            kind,
            target_block: block,
            sheet_url:
              source === "url"
                ? sheetUrl.trim()
                : `csv-upload://${fileName || "schedule.csv"}`,
            csv_url: source === "url" ? sheetUrl.trim() : null,
          })
          .select("id")
          .single();
        if (createError || !data) {
          if (createError?.code) {
            setSheetId(null);
            setError("CSVの確認を開始できませんでした。もう一度お試しください");
          } else {
            setError("読み込みの開始結果を確認できませんでした。もう一度内容を確認してください");
          }
          return;
        }
        creatingRecord = false;
        targetSheetId = data.id as string;
        setSheetId(targetSheetId);
      }
      const response = await fetch("/api/schedule-sheets/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId: targetSheetId,
          csv: source === "file" ? csv : undefined,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 404) {
          // APIの404だけで不存在と決めず、RLS下の読取が成功した場合だけ再作成を許す。
          const { data: record, error: readError } = await supabase.from("schedule_sheets").select("id").eq("id", targetSheetId).maybeSingle();
          if (!readError && !record) setSheetId(null);
        }
        setError(result.error ?? "CSVを確認できませんでした。もう一度お試しください");
        return;
      }
      if (!["columns", "rows", "additions", "updates", "deletions", "errors", "skips"].every((key) => Array.isArray(result[key]))) throw new Error("Invalid schedule preview");
      setPreview(result as ScheduleImportPreview);
      setDeletionIds((result as ScheduleImportPreview).deletions.map((row) => row.id));
    } catch {
      setError(creatingRecord
        ? "読み込みの開始結果を確認できませんでした。もう一度内容を確認してください"
        : "CSVを確認できませんでした。もう一度お試しください");
    } finally {
      setLoading(false);
    }
  }

  async function apply() {
    if (!preview || !sheetId || applying || loading || uncertainOperation) return;
    setApplying(true);
    setError(null);
    let sent = false;
    let saved = false;
    try {
      const validated = await validateEditedRows(preview.rows);
      if (!validated) return;
      const validRows = [...validated.additions, ...validated.updates];
      if (validRows.length === 0) return;
      const supabase = createClient();
      const beforeApply = new Date().toISOString();
      sent = true;
      const { error: applyError } = await supabase.rpc("apply_schedule_sheet_import", {
        target_sheet_id: sheetId,
        import_rows: validRows.map(toRpcRow),
      });
      if (applyError) {
        if (!applyError.code) setUncertainOperation("apply");
        else setError("予定に登録できませんでした。内容を確認して、もう一度お試しください");
        return;
      }
      saved = true;
      setLastApplied([]);
      router.refresh();
      const remaining = validated.rows.filter((row) => row.status === "error");
      if (remaining.length > 0) {
        setPreview({ ...validated, rows: remaining, additions: [], updates: [], deletions: [] });
      } else {
        setPreview(null);
        setCsv("");
        setFileName("");
        setSheetUrl("");
        setSheetId(null);
      }
      setDeletionIds([]);
      // 登録は完了している。取り消し用の取得失敗を登録失敗にしない。
      const { data: insertedData, error: readError } = await supabase
        .from("practice_schedules").select("*").eq("source_sheet_id", sheetId).gte("created_at", beforeApply);
      if (readError || !insertedData) throw new Error("Undo information unavailable");
      setLastApplied(insertedData as PracticeSchedule[]);
    } catch {
      if (saved) setError("予定は登録しましたが、取り消す予定を確認できませんでした。予定一覧で確認してください");
      else if (sent) setUncertainOperation("apply");
      else setError("登録を開始できませんでした。もう一度お試しください");
    } finally {
      setApplying(false);
    }
  }

  async function undoLastApply() {
    if (lastApplied.length === 0 || undoing || uncertainOperation) return;
    setUndoing(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: deleteError } = await supabase
        .from("practice_schedules")
        .delete()
        .in("id", lastApplied.map((schedule) => schedule.id))
        .select("id");
      if (deleteError) {
        if (!deleteError.code) setUncertainOperation("delete");
        else setError("取り消せませんでした。もう一度お試しください");
        return;
      }
      if (!data) {
        setUncertainOperation("delete");
        return;
      }
      const deletedIds = new Set(data.map((row) => row.id));
      setLastApplied((current) => current.filter((schedule) => !deletedIds.has(schedule.id)));
      if (lastApplied.some((schedule) => !deletedIds.has(schedule.id))) setError("一部の予定を取り消せませんでした。予定一覧と権限を確認してください");
      router.refresh();
    } catch {
      setUncertainOperation("delete");
    } finally {
      setUndoing(false);
    }
  }

  async function deleteSelectedCandidates() {
    if (deletionIds.length === 0 || deleting || uncertainOperation) return;
    setDeleting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: deleteError } = await supabase
        .from("practice_schedules")
        .delete()
        .in("id", deletionIds)
        .select("id");
      if (deleteError) {
        if (!deleteError.code) setUncertainOperation("delete");
        else setError("削除できませんでした。もう一度お試しください");
        return;
      }
      if (!data) {
        setUncertainOperation("delete");
        return;
      }
      const deletedIds = new Set(data.map((row) => row.id));
      setPreview((current) => current ? { ...current, deletions: current.deletions.filter((row) => !deletedIds.has(row.id)) } : current);
      setDeletionIds((current) => current.filter((id) => !deletedIds.has(id)));
      if (deletionIds.some((id) => !deletedIds.has(id))) setError("一部の予定を削除できませんでした。予定一覧と権限を確認してください");
      router.refresh();
    } catch {
      setUncertainOperation("delete");
    } finally {
      setDeleting(false);
    }
  }

  async function validateEditedRows(
    rows: ScheduleImportEditableRow[],
  ): Promise<ScheduleImportPreview | null> {
    if (!sheetId) return null;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/schedule-sheets/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetId,
          rows: rows.map(({ rowNumber, values }) => ({ rowNumber, values })),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "入力内容を再確認できませんでした。もう一度お試しください");
        return null;
      }
      if (!["columns", "rows", "additions", "updates", "deletions", "errors", "skips"].every((key) => Array.isArray(result[key]))) throw new Error("Invalid schedule preview");
      const next = { ...(result as ScheduleImportPreview), deletions: preview?.deletions ?? [] };
      setPreview(next);
      return next;
    } catch {
      setError("入力内容を再確認できませんでした。もう一度お試しください");
      return null;
    } finally {
      setLoading(false);
    }
  }

  function updatePreviewCell(rowNumber: number, column: string, value: string) {
    setPreview((current) => {
      if (!current) return current;
      return {
        ...current,
        rows: current.rows.map((row) =>
          row.rowNumber === rowNumber
            ? {
              ...row,
              values: { ...row.values, [column]: value },
              status: "editing",
              message: "未確認の変更があります",
              normalized: null,
            }
            : row,
        ),
      };
    });
  }

  const applicable = preview
    ? preview.rows.filter(
      (row) => row.status === "addition" || row.status === "update",
    ).length
    : 0;
  const errorCount = preview
    ? preview.rows.filter((row) => row.status === "error").length
    : 0;
  const dirtyCount = preview
    ? preview.rows.filter((row) => row.status === "editing").length
    : 0;

  return {
    year, setYear: (value: number) => { if (value !== year) { setExistingLoading(true); setExistingError(null); setYear(value); } },
    month, setMonth: (value: number) => { if (value !== month) { setExistingLoading(true); setExistingError(null); setMonth(value); } },
    kind, setKind: (value: ScheduleSheetKind) => { if (value !== kind) { setExistingLoading(true); setExistingError(null); setKind(value); } },
    block, setBlock: (value: ScheduleSheetBlock) => { if (value !== block) { setExistingLoading(true); setExistingError(null); setBlock(value); } },
    inputMode, setInputMode,
    existing, selectedIds, setSelectedIds,
    source, setSource,
    sheetUrl, setSheetUrl, fileName, csv, setSheetId,
    preview, setPreview, loading, applying, error,
    setError, lastApplied, undoing, deletionIds, setDeletionIds,
    deleting, downloadTemplate, selectFile, previewImport,
    apply, undoLastApply, deleteSelectedCandidates, validateEditedRows, updatePreviewCell,
    applicable, errorCount, dirtyCount,
    existingError, existingLoading,
    uncertainOperation, retryReads: () => {
      setExistingLoading(true);
      setExistingError(null);
      setReadVersion((version) => version + 1);
    },
    finishUncertainOperation: () => {
      setPreview(null); setCsv(""); setFileName(""); setSheetUrl(""); setSheetId(null);
      setDeletionIds([]); setLastApplied([]); setError(null); setUncertainOperation(null);
    },
  };

}
