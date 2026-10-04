/** A menu uses the schedule saved in this operation, and never retries a failed schedule. */
export async function savePlanningBatch<T>(input: {
  scheduleDates: string[];
  menuDates: string[];
  saveSchedule: (date: string) => Promise<T | null>;
  saveMenu: (date: string, savedSchedule?: T) => Promise<boolean>;
  markMenuFailed: (date: string) => void;
}): Promise<number> {
  let failed = 0;
  const failedSchedules = new Set<string>();
  const savedSchedules = new Map<string, T>();
  for (const date of input.scheduleDates) {
    const saved = await input.saveSchedule(date);
    if (saved !== null) savedSchedules.set(date, saved);
    else { failed++; failedSchedules.add(date); }
  }
  for (const date of input.menuDates) {
    if (failedSchedules.has(date)) { failed++; input.markMenuFailed(date); continue; }
    if (!await input.saveMenu(date, savedSchedules.get(date))) failed++;
  }
  return failed;
}
