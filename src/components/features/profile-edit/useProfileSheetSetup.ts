"use client";

import { useEffect, useState } from "react";
import type { SheetHeaderData } from "@/components/features/SheetHeaderSetupDialog";

export function useProfileSheetSetup(savedSheetName: string | null, separateRecordSettings: boolean, setError: (message: string | null) => void) {
  const [sheetName, setSheetName] = useState<string>(savedSheetName ?? "");
  const [sheetOptions, setSheetOptions] = useState<string[] | null>(null);
  const [sheetNameMissing, setSheetNameMissing] = useState(false);
  const [headerData, setHeaderData] = useState<SheetHeaderData | null>(null);
  const [loadingHeader, setLoadingHeader] = useState(false);
  // スプシ連携用：部員シート名の候補を取得（失敗しても編集は続行できる）
  useEffect(() => {
    if (separateRecordSettings) return;
    let active = true;
    fetch("/api/sheets/members")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { members?: { name: string }[] }) => {
        if (!active) return;
        const names = (data.members ?? []).map((m) => m.name);
        setSheetNameMissing(Boolean(savedSheetName && !names.includes(savedSheetName)));
        // 現在の保存値が候補に無くても選べるよう加えておく
        if (savedSheetName && !names.includes(savedSheetName)) {
          names.unshift(savedSheetName);
        }
        setSheetOptions(names);
      })
      .catch(() => active && setSheetOptions([]));
    return () => {
      active = false;
    };
  }, [savedSheetName, separateRecordSettings]);

  async function fetchHeader(): Promise<SheetHeaderData | null> {
    const response = await fetch(`/api/sheets/header?sheetName=${encodeURIComponent(sheetName.trim())}`, {
      cache: "no-store",
    });
    const result = await response.json() as SheetHeaderData & { error?: string };
    if (!response.ok) {
      setError(result.error ?? "スプレッドシートの見出しを取得できませんでした");
      return null;
    }
    return result;
  }

  async function openHeaderEditor() {
    if (!sheetName.trim() || loadingHeader) return;
    setLoadingHeader(true);
    setError(null);
    try {
      const currentHeader = await fetchHeader();
      if (currentHeader) setHeaderData(currentHeader);
    } catch {
      setError("スプレッドシートの見出しを取得できませんでした。入力は残っています。もう一度読み込んでください。");
    } finally {
      setLoadingHeader(false);
    }
  }

  return { sheetName, setSheetName, sheetOptions, sheetNameMissing, headerData, setHeaderData, loadingHeader, fetchHeader, openHeaderEditor };
}
