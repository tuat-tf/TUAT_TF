export const TRAINING_SELECTION_EVENT = "tf:training-selection-change";
const fallback = new Map<string, string>();

export function trainingSelectionKey(viewerId: string) {
  return `training-review-selected-fields-${viewerId}`;
}

export function parseTrainingSelection(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) && value.every(key => typeof key === "string")
      ? [...new Set(value)] : null;
  } catch { return null; }
}

export function readTrainingSelection(key: string): string | null {
  if (fallback.has(key)) return fallback.get(key)!;
  try { return window.localStorage.getItem(key); } catch { return null; }
}

export function writeTrainingSelection(key: string, fields: string[]) {
  const raw = JSON.stringify([...new Set(fields)]);
  try {
    window.localStorage.setItem(key, raw);
    fallback.delete(key);
  } catch {
    // Keep this page usable when browser storage is unavailable.
    fallback.set(key, raw);
  }
  window.dispatchEvent(new CustomEvent(TRAINING_SELECTION_EVENT, { detail: key }));
}

export function subscribeTrainingSelection(key: string, onChange: () => void) {
  function changed(event: Event) {
    if (event instanceof CustomEvent && event.detail === key) onChange();
  }
  function stored(event: StorageEvent) {
    if (event.storageArea === window.localStorage && (event.key === key || event.key === null)) {
      fallback.delete(key);
      onChange();
    }
  }
  window.addEventListener(TRAINING_SELECTION_EVENT, changed);
  window.addEventListener("storage", stored);
  return () => {
    window.removeEventListener(TRAINING_SELECTION_EVENT, changed);
    window.removeEventListener("storage", stored);
  };
}
