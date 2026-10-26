"use server";

import { getFeed, getRecentHashtags, searchFeed, type SearchCursor } from "@/lib/queries";
import { getCurrentProfile, getCurrentUserId } from "@/lib/supabase/auth";
import type { FeedItem } from "@/types";

/** 「もっと見る」用：既取得分より古い投稿だけを追加取得する */
export async function loadFeed(
  cursors: {
    record?: { createdAt: string; id: string };
    tweet?: { createdAt: string; id: string };
  },
  limit = 30,
): Promise<FeedItem[]> {
  const profile = await getCurrentProfile();
  return getFeed(profile.id, limit, cursors);
}

/** タイムラインの検索（続きは cursor で取得） */
export async function searchTimeline(query: string, cursor: SearchCursor = null) {
  await getCurrentUserId();
  // Server actions take any input from the client; only plain strings reach the query.
  if (typeof query !== "string") return { items: [], next: null };
  const safeCursor = cursor && typeof cursor.createdAt === "string" && typeof cursor.id === "string"
    ? { createdAt: cursor.createdAt, id: cursor.id } : null;
  return searchFeed(query, safeCursor);
}

/** 投稿・返信の入力中に出す #タグ候補 */
export async function loadHashtagSuggestions() {
  return getRecentHashtags(await getCurrentUserId());
}
