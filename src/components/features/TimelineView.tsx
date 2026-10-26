"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { List, Search, X } from "lucide-react";
import { RecordCard } from "@/components/cards/RecordCard";
import { TweetCard } from "@/components/cards/TweetCard";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { CompactFeedRow } from "@/components/features/CompactFeedRow";
import { RecentHashtags, TimelineSearchBar, TimelineSearchResults } from "@/components/features/TimelineSearch";
import { SeenDivider, UnreadHeading } from "@/components/features/NewPostMarkers";
import { nextFeedCursor, type FeedCursor } from "@/lib/feed-pagination";
import { EmptyState } from "@/components/ui/empty-state";
import { SIMPLE_BLOCK_ITEMS, matchSimpleBlock } from "@/lib/constants";
import { jstToday } from "@/lib/date";
import {
  feedDateLabel,
  groupFeedItemsByDate,
  uniqueFeedItems,
} from "@/lib/feed-date";
import { cn } from "@/lib/utils";
import { loadFeed } from "@/app/(app)/timeline/actions";
import { useLastSeenFeed } from "@/hooks/use-last-seen-feed";
import { useFeedDisplay } from "@/hooks/use-feed-display";
import { unreadBoundaryIndex } from "@/lib/feed-unread";
import type { BlockViewDefault, CommentAuthor, FeedItem } from "@/types";

const PAGE = 30;
const FILTER_AUTOLOAD_PAGES = 5;

const INTERACTIVE_FEED_SELECTOR = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "[contenteditable='true']",
  "[role='button']",
  "[role='tab']",
].join(",");

/** カード内の操作部品を押したときは、外側の一覧行を開閉しない。 */
function isInteractiveFeedTarget(target: EventTarget | null, row: HTMLElement) {
  if (!(target instanceof Element)) return false;
  const control = target.closest(INTERACTIVE_FEED_SELECTOR);
  return control !== null && control !== row;
}

/**
 * タイムライン本体。カード表示と、一覧性を優先した2行表示を切り替えられる。
 * 前回開いたあとに増えた投稿を「新着の投稿」として先頭に数え、そこが終わる位置に区切りを出す。
 * ブロックの絞り込みはサーバー往復せず
 * 読み込み済みアイテムをクライアント側でフィルタするため、タブ切替が即時。
 * 絞り込み結果が足りない場合と「もっと見る」で続きのページを取得する。
 * 検索も別画面にせず、上部の欄を検索欄に切り替えて同じ場所に結果を出す（閉じるとすぐ元の一覧に戻る）。
 * 検索語は ?q= に置き、#タグのリンク・戻る操作・共有でも同じ検索を開ける。
 */
export function TimelineView({
  initialItems,
  initialFetchedAt,
  currentUser,
  initialCompact = false,
  initialBlock = "all",
  showRecordSource = false,
}: {
  initialItems: FeedItem[];
  initialFetchedAt: number;
  currentUser: CommentAuthor;
  /** 一覧表示の初期値（Cookieから復元し、初期表示のちらつきを防ぐ） */
  initialCompact?: boolean;
  /** 最初に表示するブロックタブ（マイページの「タイムラインの初期表示」） */
  initialBlock?: BlockViewDefault;
  showRecordSource?: boolean;
}) {
  const queryClient = useQueryClient();
  const feedQuery = useInfiniteQuery({
    queryKey: ["timeline", currentUser.id],
    queryFn: ({ pageParam }) => loadFeed(pageParam ?? {}, PAGE),
    initialPageParam: null as FeedCursor,
    initialData: { pages: [initialItems], pageParams: [null as FeedCursor] },
    initialDataUpdatedAt: initialFetchedAt,
    staleTime: 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
    getNextPageParam: (lastPage) => nextFeedCursor(lastPage, PAGE),
  });
  // A server refresh must replace the old first page too. Otherwise initialData
  // is ignored on revisits, leaving the timeline stale despite another DB read.
  useEffect(() => {
    const key = ["timeline", currentUser.id];
    // Back navigation can reuse the same RSC snapshot. Keep loaded older pages
    // and newer client mutations in that case, instead of truncating the feed.
    if ((queryClient.getQueryState(key)?.dataUpdatedAt ?? 0) >= initialFetchedAt) return;
    queryClient.setQueryData(key, {
      pages: [initialItems], pageParams: [null as FeedCursor],
    }, { updatedAt: initialFetchedAt });
  }, [initialItems, initialFetchedAt, currentUser.id, queryClient]);

  const items = useMemo(
    () => uniqueFeedItems(feedQuery.data.pages.flat()),
    [feedQuery.data.pages],
  );
  const [block, setBlock] = useState<string>(initialBlock);
  const filterAutoLoadCount = useRef(0);
  const { compact, toggleCompact, toggleExpanded, isCompact } = useFeedDisplay({
    initialCompact,
    cookieName: "timeline-compact",
  });

  const urlQuery = (useSearchParams().get("q") ?? "").trim();
  const [searchOpen, setSearchOpen] = useState(urlQuery !== "");
  const [searchText, setSearchText] = useState(urlQuery);
  const [query, setQuery] = useState(urlQuery);
  const [composing, setComposing] = useState(false);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  // A #tag link or back/forward changed ?q= from outside: follow it.
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    if (urlQuery !== query) {
      setSearchText(urlQuery);
      setQuery(urlQuery);
      setSearchOpen(urlQuery !== "");
    }
  }
  // Search once typing pauses, never in the middle of Japanese conversion.
  useEffect(() => {
    if (composing) return;
    const next = searchText.trim();
    if (next === query) return;
    const timer = window.setTimeout(() => setQuery(next), 350);
    return () => window.clearTimeout(timer);
  }, [searchText, composing, query]);
  // Keep ?q= in step without a server round trip or one history entry per keystroke.
  useEffect(() => {
    const url = query ? `/timeline?q=${encodeURIComponent(query)}` : "/timeline";
    if (`${window.location.pathname}${window.location.search}` !== url) window.history.replaceState(null, "", url);
  }, [query]);

  function searchNow(value: string) {
    setSearchText(value);
    setQuery(value.trim());
  }

  function toggleSearch() {
    if (searchOpen) searchNow("");
    setSearchOpen(!searchOpen);
  }

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (!matchSimpleBlock(item.author?.blocks, block)) return false;
      return true;
    });
  }, [items, block]);

  const groups = useMemo(() => groupFeedItemsByDate(filtered), [filtered]);
  // 既読の基準は「実際に画面へ出した投稿」。絞り込みで隠れている投稿は既読にしない。
  const lastSeenAt = useLastSeenFeed(currentUser.id, filtered);
  // 絞り込み後の並びで数えた新着の件数＝「以前の投稿」の区切り位置（-1 のときは何も出さない）
  const boundaryIndex = useMemo(
    () => unreadBoundaryIndex(filtered, lastSeenAt),
    [filtered, lastSeenAt],
  );

  const hasActiveFilter = block !== "all";

  useEffect(() => {
    filterAutoLoadCount.current = 0;
  }, [block]);

  useEffect(() => {
    if (
      !hasActiveFilter ||
      filtered.length >= PAGE ||
      !feedQuery.hasNextPage ||
      feedQuery.isFetching ||
      feedQuery.isError ||
      filterAutoLoadCount.current >= FILTER_AUTOLOAD_PAGES
    ) return;

    filterAutoLoadCount.current += 1;
    void feedQuery.fetchNextPage({ cancelRefetch: false });
  }, [
    feedQuery,
    filtered.length,
    hasActiveFilter,
  ]);

  function loadMore() {
    if (feedQuery.isFetching) return;
    if (feedQuery.isError && !feedQuery.isFetchNextPageError) {
      void feedQuery.refetch({ cancelRefetch: false });
    } else {
      void feedQuery.fetchNextPage({ cancelRefetch: false });
    }
  }

  function renderItem(
    item: FeedItem,
    commentsExpanded = false,
    embedded = false,
  ) {
    return item.kind === "record" ? (
      <RecordCard
        record={item}
        currentUser={currentUser}
        commentsExpanded={commentsExpanded}
        showSource={showRecordSource}
        embedded={embedded}
      />
    ) : (
      <TweetCard
        tweet={item}
        currentUser={currentUser}
        commentsExpanded={commentsExpanded}
        embedded={embedded}
        showSource={showRecordSource}
      />
    );
  }

  return (
    <>
      <div className="w-full px-4 pt-1 pb-3 md:mx-auto md:max-w-[1120px] md:px-6 lg:pb-2">
        <div data-ui-toolbar="timeline" className="flex min-h-9 items-center gap-2 lg:min-h-8">
          {searchOpen ? (
            <TimelineSearchBar value={searchText} onChange={setSearchText} onComposingChange={setComposing} onSubmit={() => searchNow(searchText)} />
          ) : (
            <div className="min-w-0 flex-1"><SegmentedControl items={SIMPLE_BLOCK_ITEMS} value={block} onChange={setBlock} /></div>
          )}
          {!searchOpen && <button
            data-ui-action
            type="button"
            onClick={toggleCompact}
            aria-pressed={compact}
            aria-label={compact ? "カード表示に戻す" : "一覧表示にする"}
            title={compact ? "カード表示に戻す" : "一覧表示にする"}
            className={cn(
              "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold pressable",
              compact ? "border-accent bg-accent text-white" : "border-separator bg-card text-muted2",
            )}
          >
            <List size={14} />
            <span>一覧</span>
          </button>}
          {/* Always the rightmost control, so it stays put; it turns into × while searching. */}
          <button
            data-ui-action
            type="button"
            onClick={toggleSearch}
            aria-label={searchOpen ? "検索を閉じる" : "検索"}
            title={searchOpen ? "検索を閉じる" : "検索"}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted2 pressable"
          >
            {searchOpen ? <X size={18} /> : <Search size={18} />}
          </button>
        </div>
      </div>


      <div className="w-full px-4 pt-1 md:mx-auto md:max-w-[1120px] md:px-6">
        {searchOpen && !query && <RecentHashtags onPick={searchNow} />}
        {searchOpen && query ? (
          <TimelineSearchResults query={query} viewerId={currentUser.id} renderItem={(item) => renderItem(item)} />
        ) : <>
        {filtered.length === 0 ? (
          feedQuery.isError ? <EmptyState title="投稿を取得できませんでした" description="もう一度お試しください。" /> : feedQuery.hasNextPage ? (
            <EmptyState title={feedQuery.isFetching ? "条件に合う投稿を探しています" : "続きの投稿を確認できます"} />
          ) : <EmptyState title="条件に合う投稿はありません" description="条件を変えてみてください。" />
        ) : (
          <div className="space-y-3 lg:space-y-2">
            {boundaryIndex > 0 && <UnreadHeading count={boundaryIndex} />}
            {(() => {
              let offset = 0;
              return groups.map((group) => {
                const groupStart = offset;
                offset += group.items.length;
                return (
                  <section key={group.date} aria-labelledby={`feed-date-${group.date}`}>
                    {boundaryIndex === groupStart && <SeenDivider />}
                    <div className="mb-1.5 flex items-center gap-1.5 px-1">
                      <h2
                        id={`feed-date-${group.date}`}
                        className="text-[12px] font-semibold text-muted2"
                      >
                        {feedDateLabel(group.date, jstToday(), jstToday(-1))}
                      </h2>
                      <span className="text-[10px] text-muted">・{group.items.length}件</span>
                    </div>
                    {compact ? (
                      <div data-ui-panel className="divide-y divide-separator/70 overflow-hidden rounded-card border border-separator/70 bg-card">
                        {group.items.map((item, index) => {
                          const key = `${item.kind}-${item.id}`;
                          const collapsed = isCompact(key);
                          const commentsExpanded = !collapsed && (item.comments_count ?? 0) > 0;
                          return (
                            <Fragment key={key}>
                              {index > 0 && boundaryIndex === groupStart + index && (
                                <div className="bg-card px-3"><SeenDivider /></div>
                              )}
                              <div
                                role="button"
                                data-ui-row
                                tabIndex={0}
                                aria-label={collapsed ? "投稿の詳細を開く" : "投稿の詳細を閉じる"}
                                aria-expanded={!collapsed}
                                onClick={(event) => {
                                  if (isInteractiveFeedTarget(event.target, event.currentTarget)) return;
                                  toggleExpanded(key);
                                }}
                                onKeyDown={(event) => {
                                  if (event.target !== event.currentTarget) return;
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    toggleExpanded(key);
                                  }
                                }}
                                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                              >
                                {collapsed
                                  ? <CompactFeedRow item={item} />
                                  : renderItem(item, commentsExpanded, true)}
                              </div>
                            </Fragment>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-3 lg:space-y-2">
                        {group.items.map((item, index) => (
                          <Fragment key={`${item.kind}-${item.id}`}>
                            {index > 0 && boundaryIndex === groupStart + index && <SeenDivider />}
                            {renderItem(item)}
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </section>
                );
              });
            })()}

          </div>
        )}
        {(feedQuery.hasNextPage || feedQuery.isError) && (
          <div className="pt-3 pb-2">
            {feedQuery.isError && filtered.length > 0 && <p role="status" className="mb-2 text-caption text-muted2">投稿を取得できませんでした。もう一度お試しください。</p>}
            <Button variant="outline" size="lg" onClick={loadMore} disabled={feedQuery.isFetching}>
              {feedQuery.isFetching ? "読み込み中…" : feedQuery.isError ? "再試行" : "もっと見る"}
            </Button>
          </div>
        )}
        </>}
      </div>
    </>
  );
}
