"use client";

import type { ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedSkeleton } from "@/components/ui/page-skeletons";
import { searchTimeline } from "@/app/(app)/timeline/actions";
import { useRecentHashtags } from "@/hooks/use-hashtag-suggestions";
import type { SearchCursor } from "@/lib/queries/search";
import type { FeedItem } from "@/types";

/** タイムライン上部の検索欄（絞り込み欄と入れ替わる）。閉じる×は右端の検索ボタンが兼ねる。 */
export function TimelineSearchBar({
  value,
  onChange,
  onComposingChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onComposingChange: (composing: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      role="search"
      className="relative min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <Input
        type="search"
        enterKeyHint="search"
        autoFocus={!value}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onCompositionStart={() => onComposingChange(true)}
        onCompositionEnd={() => onComposingChange(false)}
        placeholder="本文・名前・#タグで検索"
        aria-label="タイムラインを検索"
        maxLength={100}
        className="h-9 rounded-full py-0 pl-8 pr-3 [&::-webkit-search-cancel-button]:hidden"
      />
    </form>
  );
}

/** 検索欄が空のときに出す、最近よく使われている #タグ。押すとそのタグで探す。 */
export function RecentHashtags({ onPick }: { onPick: (tag: string) => void }) {
  const { data } = useRecentHashtags(true);
  if (!data || data.length === 0) return null;
  return (
    <section aria-label="最近のハッシュタグ" className="flex gap-1.5 overflow-x-auto pb-3">
      {data.slice(0, 15).map((item) => (
        <button data-ui-action
          key={item.tag}
          type="button"
          onClick={() => onPick(`#${item.tag}`)}
          className="inline-flex min-h-8 shrink-0 items-center rounded-full bg-accent/10 px-3 text-[13px] font-semibold text-accent pressable"
        >
          #{item.tag}
        </button>
      ))}
    </section>
  );
}

/** 検索結果。タイムラインと同じカードで、新しい順に出す。 */
export function TimelineSearchResults({
  query,
  viewerId,
  renderItem,
}: {
  query: string;
  viewerId: string;
  renderItem: (item: FeedItem) => ReactNode;
}) {
  const results = useInfiniteQuery({
    queryKey: ["timeline-search", viewerId, query],
    queryFn: ({ pageParam }) => searchTimeline(query, pageParam),
    initialPageParam: null as SearchCursor,
    getNextPageParam: (lastPage) => lastPage.next,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];

  if (results.isPending) return <FeedSkeleton withHeader={false} />;
  if (results.isError && items.length === 0) {
    return (
      <EmptyState
        title="検索できませんでした"
        description="もう一度お試しください。"
        action={<Button variant="outline" onClick={() => void results.refetch()}>再試行</Button>}
      />
    );
  }
  if (items.length === 0) return <EmptyState title="見つかりませんでした" description="別の言葉で探してみてください。" />;
  return (
    <>
      <div className="space-y-3 lg:space-y-2">
        {items.map((item) => <div key={`${item.kind}-${item.id}`}>{renderItem(item)}</div>)}
      </div>
      {(results.hasNextPage || results.isError) && (
        <div className="pt-3 pb-2">
          {results.isError && <p role="status" className="mb-2 text-caption text-muted2">続きを取得できませんでした。もう一度お試しください。</p>}
          <Button variant="outline" size="lg" onClick={() => void results.fetchNextPage({ cancelRefetch: false })} disabled={results.isFetching}>
            {results.isFetching ? "読み込み中…" : results.isError ? "再試行" : "もっと見る"}
          </Button>
        </div>
      )}
    </>
  );
}
