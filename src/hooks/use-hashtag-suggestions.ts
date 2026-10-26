"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadHashtagSuggestions } from "@/app/(app)/timeline/actions";
import { suggestHashtags, type RankedHashtag } from "@/lib/hashtags";

/** 最近の #タグ（全画面で共有し、5分は読み直さない）。enabled になって初めて取得する。 */
export function useRecentHashtags(enabled: boolean) {
  return useQuery({
    queryKey: ["hashtag-suggestions"],
    queryFn: () => loadHashtagSuggestions(),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** 書きかけのタグ（null なら入力中でない）に合う候補。 */
export function useHashtagSuggestions(query: string | null): RankedHashtag[] {
  const { data } = useRecentHashtags(query !== null);
  return useMemo(() => (query === null || !data ? [] : suggestHashtags(data, query)), [data, query]);
}
