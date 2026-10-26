"use client";

import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { RecordCard } from "@/components/cards/RecordCard";
import { TweetCard } from "@/components/cards/TweetCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedSkeleton } from "@/components/ui/page-skeletons";
import { searchTimeline } from "@/app/(app)/timeline/actions";
import { useRecentHashtags } from "@/hooks/use-hashtag-suggestions";
import type { SearchCursor } from "@/lib/queries/search";
import type { CommentAuthor } from "@/types";

/**
 * タイムラインの検索。入力が止まってから探す（日本語の変換中は探さない）。
 * 何も入れていないときは最近よく使われている #タグ を出す。
 */
export function TimelineSearch({
  initialQuery,
  currentUser,
  showRecordSource = false,
}: {
  initialQuery: string;
  currentUser: CommentAuthor;
  showRecordSource?: boolean;
}) {
  const [text, setText] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery.trim());
  const [composing, setComposing] = useState(false);
  const recentTags = useRecentHashtags(query === "");

  useEffect(() => {
    if (composing) return;
    const next = text.trim();
    if (next === query) return;
    const timer = window.setTimeout(() => setQuery(next), 350);
    return () => window.clearTimeout(timer);
  }, [text, composing, query]);

  // Keep the URL shareable and restorable on back, without a server round trip.
  useEffect(() => {
    const url = query ? `/timeline/search?q=${encodeURIComponent(query)}` : "/timeline/search";
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
  }, [query]);

  const results = useInfiniteQuery({
    queryKey: ["timeline-search", currentUser.id, query],
    queryFn: ({ pageParam }) => searchTimeline(query, pageParam),
    initialPageParam: null as SearchCursor,
    getNextPageParam: (lastPage) => lastPage.next,
    enabled: query !== "",
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];

  function searchNow(value: string) {
    setText(value);
    setQuery(value.trim());
  }

  return (
    <div className="w-full px-4 pt-1 pb-6 md:mx-auto md:max-w-[1120px] md:px-6">
      <form
        role="search"
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          searchNow(text);
        }}
      >
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <Input
          type="search"
          enterKeyHint="search"
          autoFocus={!initialQuery}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          placeholder="本文・名前・#タグで検索"
          aria-label="タイムラインを検索"
          maxLength={100}
          className="pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden"
        />
        {text && (
          <button data-ui-action
            type="button"
            aria-label="検索語を消す"
            onClick={() => searchNow("")}
            className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-muted pressable"
          >
            <X size={16} />
          </button>
        )}
      </form>

      <div className="pt-4">
        {query === "" ? (
          recentTags.data && recentTags.data.length > 0 && (
            <section aria-labelledby="recent-hashtags">
              <h2 id="recent-hashtags" className="mb-2 px-1 text-[12px] font-semibold text-muted2">最近のハッシュタグ</h2>
              <div className="flex flex-wrap gap-1.5">
                {recentTags.data.slice(0, 15).map((item) => (
                  <button data-ui-action
                    key={item.tag}
                    type="button"
                    onClick={() => searchNow(`#${item.tag}`)}
                    className="inline-flex min-h-8 items-center rounded-full bg-accent/10 px-3 text-[13px] font-semibold text-accent pressable"
                  >
                    #{item.tag}
                  </button>
                ))}
              </div>
            </section>
          )
        ) : results.isPending ? (
          <FeedSkeleton withHeader={false} />
        ) : results.isError && items.length === 0 ? (
          <EmptyState
            title="検索できませんでした"
            description="もう一度お試しください。"
            action={<Button variant="outline" onClick={() => void results.refetch()}>再試行</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState title="見つかりませんでした" description="別の言葉で探してみてください。" />
        ) : (
          <div className="space-y-3 lg:space-y-2">
            {items.map((item) => item.kind === "record" ? (
              <RecordCard key={`record-${item.id}`} record={item} currentUser={currentUser} showSource={showRecordSource} />
            ) : (
              <TweetCard key={`tweet-${item.id}`} tweet={item} currentUser={currentUser} showSource={showRecordSource} />
            ))}
          </div>
        )}
        {query !== "" && items.length > 0 && (results.hasNextPage || results.isError) && (
          <div className="pt-3">
            {results.isError && <p role="status" className="mb-2 text-caption text-muted2">続きを取得できませんでした。もう一度お試しください。</p>}
            <Button variant="outline" size="lg" onClick={() => void results.fetchNextPage({ cancelRefetch: false })} disabled={results.isFetching}>
              {results.isFetching ? "読み込み中…" : results.isError ? "再試行" : "もっと見る"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
