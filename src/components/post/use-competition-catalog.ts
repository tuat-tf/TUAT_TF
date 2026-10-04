"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CompetitionEvent } from "@/lib/competition-goals";
import type { CompetitionRow } from "@/types";

type Catalog = { events: CompetitionEvent[]; competitions: CompetitionRow[] };

const EMPTY: Catalog = { events: [], competitions: [] };
/** 一度読んだらセッション中は使い回す（結果フォームを開くたびに引かない） */
let cache: Catalog | null = null;

/**
 * 結果フォーム用の種目マスタと大会マスタ。
 * FAB は全画面に常駐するので、フォームを開いたときに初めて読む。
 */
export function useCompetitionCatalog(enabled: boolean) {
  const [catalog, setCatalog] = useState<Catalog | null>(cache);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // キャッシュがあっても開くたびに裏で読み直す（種目や大会を足した直後に古い一覧を見せないため）。
    if (!enabled) return;
    let active = true;
    void (async () => {
      const supabase = createClient();
      const [events, competitions] = await Promise.all([
        supabase
          .from("competition_events")
          .select("name,sort_order,measure_type,time_format")
          .order("sort_order")
          .order("name"),
        supabase
          .from("competitions")
          .select("id,name,starts_on,ends_on,sort_order,is_countdown")
          .order("sort_order")
          .order("starts_on", { ascending: false }),
      ]);
      if (!active) return;
      if (events.error || competitions.error) { setStatus("error"); return; }
      cache = {
        events: (events.data ?? []) as CompetitionEvent[],
        competitions: (competitions.data ?? []) as CompetitionRow[],
      };
      setCatalog(cache);
      setStatus("ready");
    })().catch(() => { if (active) setStatus("error"); });
    return () => {
      active = false;
    };
  }, [enabled, attempt]);

  return {
    ...(catalog ?? EMPTY),
    hasData: catalog !== null,
    isError: status === "error",
    isLoading: enabled && status === "loading",
    retry: () => { setStatus("loading"); setAttempt((value) => value + 1); },
  };
}
