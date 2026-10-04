/** Drafts belong to an account and one recipient context, never to the browser as a whole. */
export function monthlyPlanningDraftKey(userId: string, month: string, scope: string, targetIds: string[]): string {
  return `track-app:monthly-planner:v2:${userId}:${month}:${scope}:${[...new Set(targetIds)].sort().join(",") || "block"}`;
}

/** Do not persist saved list snapshots; restoring them could undo another person's changes. */
export function pendingPlanningDrafts<T>(drafts: Record<string, T>, states: Record<string, string>, kind: "schedule" | "menu"): Record<string, T> {
  return Object.fromEntries(Object.entries(drafts).filter(([date]) => ["dirty", "error"].includes(states[`${kind}:${date}`])));
}
