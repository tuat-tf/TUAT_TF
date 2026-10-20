import { queryOptions } from "@tanstack/react-query";
import { middleLongMenuMonths, type MiddleLongMenuSnapshot } from "@/lib/middle-long-menu-data";
import type { ScheduleWithMenus } from "@/types";

/** ホームと予定一覧で取得・鮮度・キャンセルの扱いを共通にする。 */
export function middleLongMenuQueryOptions({
  userId,
  schedules,
  enabled,
  initialData,
}: {
  userId: string | undefined;
  schedules: ScheduleWithMenus[];
  enabled: boolean;
  initialData?: MiddleLongMenuSnapshot;
}) {
  const months = middleLongMenuMonths(schedules);
  const canLoad = process.env.NEXT_PUBLIC_PC_TRIAL !== "true" && enabled && !!userId && months.length > 0;
  return queryOptions({
    queryKey: ["middle-long-menu-csv", userId, months.join(",")],
    queryFn: async ({ signal }): Promise<MiddleLongMenuSnapshot> => {
      const response = await fetch(`/api/middle-long-menus?months=${months.join(",")}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Failed to load middle-long menus");
      return response.json();
    },
    initialData,
    enabled: canLoad,
    staleTime: 60_000,
    // 月別シートの変更を、予定画面や展開中のホームカードへ反映する。
    refetchInterval: canLoad ? 60_000 : false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
