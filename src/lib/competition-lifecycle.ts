type Lifecycle = { archive_at?: string | null };

/** 指定時刻以降は保存済みの大会として扱う。データは削除しない。 */
export function isCompetitionArchived(competition: Lifecycle, now = Date.now()): boolean {
  return Boolean(competition.archive_at && Date.parse(competition.archive_at) <= now);
}

/** 速報の取得を終了したか、最終日を過ぎた大会。ホームでは進行中の表示をやめて終了と出す。 */
export function isCompetitionFinished(
  competition: { program_closed_at?: string | null; starts_on: string; ends_on: string | null },
  today: string,
): boolean {
  return Boolean(competition.program_closed_at) || (competition.ends_on ?? competition.starts_on) < today;
}

const FINISHED_HOME_DAYS = 14;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * ホームに「終了・結果を見る」の1行で残す大会（終了済み・最終日から2週間以内・アーカイブ前、新しい順）。
 * OB戦も速報を取り込んだ大会も同じ扱い。2週間を過ぎるか、アーカイブするとホームから消える。
 */
export function finishedHomeCompetitions<T extends Lifecycle & { program_closed_at?: string | null; starts_on: string; ends_on: string | null }>(
  competitions: T[], today: string, now = Date.now(),
): T[] {
  return competitions
    .filter((c) => !isCompetitionArchived(c, now) && isCompetitionFinished(c, today)
      && addDays(c.ends_on ?? c.starts_on, FINISHED_HOME_DAYS) >= today)
    .sort((a, b) => (b.ends_on ?? b.starts_on).localeCompare(a.ends_on ?? a.starts_on));
}

export function selectHomeCompetition<T extends Lifecycle & { is_countdown: boolean; starts_on: string; ends_on: string | null }>(
  competitions: T[], now = Date.now(),
): T | null {
  const active = competitions.filter((c) => !isCompetitionArchived(c, now));
  const selected = active.find((c) => c.is_countdown);
  if (selected) return selected;
  // 明示的なホーム選択を解除した場合は自動選択しない。
  if (!competitions.some((c) => c.is_countdown && isCompetitionArchived(c, now))) return null;
  const today = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
  return active.filter((c) => (c.ends_on ?? c.starts_on) >= today)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on))[0] ?? null;
}
