"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { parseTrainingSelection, readTrainingSelection, subscribeTrainingSelection, trainingSelectionKey, writeTrainingSelection } from "@/lib/training-review-selection";

export function useTrainingReviewSelection(viewerId?: string) {
  const key = viewerId ? trainingSelectionKey(viewerId) : undefined;
  const [local, setLocal] = useState<string[] | null>(null);
  const subscribe = useCallback((changed: () => void) => key ? subscribeTrainingSelection(key, changed) : () => {}, [key]);
  const snapshot = useCallback(() => key ? readTrainingSelection(key) : null, [key]);
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const selected = useMemo(() => parseTrainingSelection(raw), [raw]);
  const setSelected = useCallback((fields: string[]) => {
    if (key) writeTrainingSelection(key, fields);
    else setLocal(fields);
  }, [key]);
  return [key ? selected : local, setSelected] as const;
}
