// タイムラインの検索と、#タグ候補の取得。

import { createClient } from "@/lib/supabase/server";
import { normalizeRecordWithAuthor, normalizeTweetWithAuthor } from "@/lib/profile-normalize";
import { RECORD_HASHTAG_COLUMNS, rankHashtags, type HashtagUse, type RankedHashtag } from "@/lib/hashtags";
import type { FeedItem } from "@/types";
import { RECORD_LIST_SELECT, RECORD_LIST_AUTHOR_SELECT, TWEET_AUTHOR_SELECT } from "./internal";
import { hydrateFeedRows } from "./feed";

export type SearchCursor = { createdAt: string; id: string } | null;
export const SEARCH_PAGE = 30;

/**
 * 本文・投稿者名・返信から投稿を探す（search_feed）。見つかった投稿はタイムラインと同じ形で返す。
 * 一致の判定とタイムラインに出す条件はDB関数側にあり、ここは取得と並べ替えだけ。
 */
export async function searchFeed(query: string, cursor: SearchCursor = null): Promise<{ items: FeedItem[]; next: SearchCursor }> {
  const q = query.trim().slice(0, 100);
  if (!q) return { items: [], next: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_feed", {
    p_query: q, p_before_at: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null, p_limit: SEARCH_PAGE,
  });
  if (error) throw new Error(`Failed to search posts: ${error.message}`);
  const hits = data ?? [];
  if (hits.length === 0) return { items: [], next: null };

  const recordIds = hits.filter((hit) => hit.kind === "record").map((hit) => hit.id);
  const tweetIds = hits.filter((hit) => hit.kind === "tweet").map((hit) => hit.id);
  const [recordsResult, tweetsResult] = await Promise.all([
    supabase.from("practice_records").select(`${RECORD_LIST_SELECT}, ${RECORD_LIST_AUTHOR_SELECT}`).in("id", recordIds),
    supabase.from("tweets").select(`*, ${TWEET_AUTHOR_SELECT}`).in("id", tweetIds),
  ]);
  if (recordsResult.error) throw new Error(`Failed to load found records: ${recordsResult.error.message}`);
  if (tweetsResult.error) throw new Error(`Failed to load found posts: ${tweetsResult.error.message}`);

  const items = await hydrateFeedRows(
    supabase,
    (recordsResult.data ?? []).map((row) => normalizeRecordWithAuthor({ ...row, record_fields_snapshot: null })),
    (tweetsResult.data ?? []).map(normalizeTweetWithAuthor),
  );
  const last = hits[hits.length - 1];
  return { items, next: hits.length === SEARCH_PAGE ? { createdAt: last.created_at, id: last.id } : null };
}

/** 直近1週間のつぶやき・返信・練習記録に書かれた #タグ を、よく・最近使われた順に返す。 */
export async function getRecentHashtags(currentUserId: string): Promise<RankedHashtag[]> {
  const supabase = await createClient();
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [tweets, comments, records] = await Promise.all([
    supabase.from("tweets").select("content, user_id, created_at")
      .gte("created_at", since)
      .or("content.like.*#*,content.like.*＃*")
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("comments").select("content, user_id, created_at")
      .gte("created_at", since)
      .or("content.like.*#*,content.like.*＃*")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("practice_records").select("memo, menu_text, focus_text, result_text, strength_text, user_id, created_at")
      .gte("created_at", since)
      .or(RECORD_HASHTAG_COLUMNS.flatMap((column) => [`${column}.like.*#*`, `${column}.like.*＃*`]).join(","))
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (tweets.error) throw new Error(`Failed to load hashtags: ${tweets.error.message}`);
  if (comments.error) throw new Error(`Failed to load hashtags: ${comments.error.message}`);
  if (records.error) throw new Error(`Failed to load hashtags: ${records.error.message}`);
  const uses: HashtagUse[] = [
    ...[...(tweets.data ?? []), ...(comments.data ?? [])].map((row) => ({
      text: row.content ?? "", createdAt: row.created_at, mine: row.user_id === currentUserId,
    })),
    ...(records.data ?? []).map((row) => ({
      text: RECORD_HASHTAG_COLUMNS.map((column) => row[column] ?? "").join(" "),
      createdAt: row.created_at, mine: row.user_id === currentUserId,
    })),
  ];
  return rankHashtags(uses, now.getTime());
}
