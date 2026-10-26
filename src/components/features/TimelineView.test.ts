import { Children, isValidElement, type ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { CommentAuthor } from "@/types";
const state = vi.hoisted(() => ({
  effects: [] as (() => void)[], options: {} as Record<string, unknown>,
  query: { data: { pages: [[]] }, hasNextPage: true, isFetching: false, isError: false, isFetchNextPageError: false, fetchNextPage: vi.fn(), refetch: vi.fn() },
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => [initial, vi.fn()],
  useMemo: (fn: () => unknown) => fn(),
  useRef: (initial: unknown) => ({ current: initial }),
  useEffect: (fn: () => void) => { state.effects.push(fn); },
}));
vi.mock("@tanstack/react-query", () => ({
  useInfiniteQuery: (options: Record<string, unknown>) => { state.options = options; return state.query; },
  useQueryClient: () => ({ getQueryState: () => ({ dataUpdatedAt: 10 }), setQueryData: vi.fn() }),
}));
vi.mock("@/app/(app)/timeline/actions", () => ({ loadFeed: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/features/TimelineSearch", () => ({ RecentHashtags: () => null, TimelineSearchBar: () => null, TimelineSearchResults: () => null }));
vi.mock("@/components/cards/RecordCard", () => ({ RecordCard: () => null }));
vi.mock("@/components/cards/TweetCard", () => ({ TweetCard: () => null }));
vi.mock("@/hooks/use-last-seen-feed", () => ({ useLastSeenFeed: () => null }));
vi.mock("@/hooks/use-feed-display", () => ({ useFeedDisplay: () => ({ compact: false, isCompact: () => false }) }));
import { TimelineView } from "./TimelineView";
function nodes(node: ReactNode): Record<string, unknown>[] {
  return Children.toArray(node).flatMap(child => {
    if (!isValidElement<Record<string, unknown>>(child)) return [];
    return [child.props, ...nodes(child.props.children as ReactNode)];
  });
}
function render() {
  const tree = TimelineView({ initialItems: [], initialFetchedAt: 1, currentUser: { id: "member" } as CommentAuthor, initialBlock: "short" });
  state.effects.forEach(effect => effect());
  return nodes(tree);
}
beforeEach(() => {
  vi.stubGlobal("window", { location: { pathname: "/timeline", search: "" }, history: { replaceState: vi.fn() }, setTimeout, clearTimeout });
  state.effects = [];
  Object.assign(state.query, { hasNextPage: true, isFetching: false, isError: false, isFetchNextPageError: false });
});
it("loads missing filtered pages without cancelling concurrent work", () => {
  render();
  expect(state.query.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
  expect(state.options.retry).toBe(false);
});
it.each(["isFetching", "isError"] as const)("does not automatically append while %s", key => {
  state.query[key] = true;
  const result = render();
  expect(state.query.fetchNextPage).not.toHaveBeenCalled();
  expect(result.some(props => props.title === "条件に合う投稿はありません")).toBe(false);
});
it("offers more pages even when no matching item has been loaded", () => {
  const result = render();
  expect(result.some(props => props.children === "もっと見る" && typeof props.onClick === "function")).toBe(true);
});
it.each([true, false])("retries the failed request type explicitly (next=%s)", next => {
  Object.assign(state.query, { isError: true, isFetchNextPageError: next });
  const result = render();
  const retry = result.find(props => props.children === "再試行")!;
  expect(retry).toBeDefined();
  (retry.onClick as () => void)();
  expect(next ? state.query.fetchNextPage : state.query.refetch).toHaveBeenCalledWith({ cancelRefetch: false });
});
it("shows empty results only after all pages have been checked", () => {
  state.query.hasNextPage = false;
  expect(render().some(props => props.title === "条件に合う投稿はありません")).toBe(true);
  expect(state.query.fetchNextPage).not.toHaveBeenCalled();
});
