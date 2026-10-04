type SavedOption = { id: string; text: string; created_by: string };

/** Confirm every requested addition/retention and removal; permitted later additions may coexist. */
export function notePollSaveConfirmed(
  actual: readonly SavedOption[], expected: readonly SavedOption[], removedIds: readonly string[], pollEnabled: boolean,
): boolean {
  if (!pollEnabled && actual.length !== expected.length) return false;
  if (actual.some((option) => removedIds.includes(option.id))) return false;
  return expected.every((option) => actual.some((saved) => saved.id === option.id && saved.text === option.text && saved.created_by === option.created_by));
}
