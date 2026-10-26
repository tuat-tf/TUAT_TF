"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { jstToday } from "@/lib/date";
import { readCompetitionProgramEntries } from "@/lib/competition-program-query";
import { startCompetitionProgramPolling } from "@/lib/competition-program-poll";
import { isCompetitionArchived } from "@/lib/competition-lifecycle";
import type { CompetitionProgramEntryRow, CompetitionRow } from "@/types";

export function useCompetitionProgram(competition: CompetitionRow, initialEntries: CompetitionProgramEntryRow[]) {
  const [fetched, setFetched] = useState<{
    source: CompetitionProgramEntryRow[]; competitionId: string; entries: CompetitionProgramEntryRow[];
  } | null>(null);
  const { id, starts_on: startsOn, ends_on: endsOn, archive_at: archiveAt, program_closed_at: closedAt } = competition;
  const hasSource = Boolean(competition.program_source_url);
  useEffect(() => startCompetitionProgramPolling(
    (signal) => readCompetitionProgramEntries(createClient(), id, signal),
    (entries) => setFetched({ source: initialEntries, competitionId: id, entries }),
    () => { const today = jstToday(); return hasSource && !closedAt && !isCompetitionArchived({ archive_at: archiveAt }) && startsOn <= today && today <= (endsOn ?? startsOn); },
  ), [id, startsOn, endsOn, hasSource, archiveAt, closedAt, initialEntries]);
  // 手動更新・別大会への遷移で来た新しいSSRデータを、古い取得結果で覆わない。
  return fetched?.source === initialEntries && fetched.competitionId === id ? fetched.entries : initialEntries;
}
