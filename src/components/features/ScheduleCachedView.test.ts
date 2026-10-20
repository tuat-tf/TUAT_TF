import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { SchedulePageData } from "@/lib/schedule-page-data";

const state = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], options: [] as Record<string, unknown>[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [state.values[index], (value: unknown) => { state.values[index] = value; }];
  },
  useEffect: () => {},
  useMemo: (create: () => unknown) => create(),
}));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: (options: Record<string, unknown>) => {
    state.options.push(options);
    return { data: options.initialData, isError: false, refetch: vi.fn() };
  },
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}));
import { ScheduleCachedView } from "./ScheduleCachedView";

const initialData = {
  userId: "member", wantsSheetMenus: true, middleLongMenuSnapshot: null,
  schedules: [{ id: "schedule", schedule_date: "2026-10-20", schedule_type: "practice", target_blocks: ["middle_long"], menus: [] }],
} as unknown as SchedulePageData;
function render(data = initialData) {
  state.cursor = 0; state.options = [];
  const tree = ScheduleCachedView({ initialData: data });
  return (tree.props.children as ReactElement<Record<string, unknown>>[])[1].props;
}
beforeEach(() => { state.values = []; });

it("stops CSV polling on non-practice and short-distance filters and resumes on visible practice menus", () => {
  let view = render();
  expect(state.options[1].enabled).toBe(true);
  (view.onTypeChange as (value: string) => void)("meet");
  view = render();
  expect(state.options[1]).toMatchObject({ enabled: false, refetchInterval: false });
  (view.onTypeChange as (value: string) => void)("practice");
  (view.onBlockChange as (value: string) => void)("short");
  view = render();
  expect(state.options[1]).toMatchObject({ enabled: false, refetchInterval: false });
  (view.onBlockChange as (value: string) => void)("middle_long");
  view = render();
  expect(state.options[1]).toMatchObject({ enabled: true, refetchInterval: 60_000 });
  expect(view.schedules).toBe(initialData.schedules);
});
it("keeps shared practice menus fresh when they remain visible under the short-distance filter", () => {
  const shared = { ...initialData, schedules: initialData.schedules.map(schedule => ({ ...schedule, target_blocks: [] })) };
  const view = render(shared);
  (view.onBlockChange as (value: string) => void)("short");
  render(shared);
  expect(state.options[1]).toMatchObject({ enabled: true, refetchInterval: 60_000 });
});
