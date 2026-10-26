"use client";

import { Fragment, useMemo } from "react";
import { format } from "date-fns";
import { SegmentedControl } from "@/components/ui/segmented";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ScheduleCard } from "@/components/cards/ScheduleCard";
import { SCHEDULE_TYPE_OPTIONS } from "@/lib/constants";
import type { ScheduleWithMenus, Attendee, AttendanceDefaultBlock, AttendanceStatusOrNone, AuthorMini, Block } from "@/types";

export function filterSchedules(schedules: ScheduleWithMenus[], type: string, block: "all" | "middle_long" | "short") {
  return schedules.filter(schedule => {
    const typeMatches = type === "all" || (type === "meet"
      ? schedule.schedule_type === "meet" || schedule.schedule_type === "event"
      : schedule.schedule_type === type);
    return typeMatches && (block === "all" || schedule.target_blocks.length === 0 || schedule.target_blocks.includes(block));
  });
}

/**
 * 練習予定の一覧＋種別タブ。
 * タブ切り替えはサーバー往復せず、読み込み済みの予定をクライアント側で
 * 絞り込むため即時に切り替わる。
 */
export function ScheduleView({
  schedules,
  userId,
  myProfile,
  viewerBlocks,
  canEditMenu,
  canManageAllMenus = false,
  editableMenuBlocks = [],
  canManage = false,
  canDecidePractice = false,
  attendeesBySchedule,
  myStatusBySchedule,
  myLateBySchedule,
  myLateNoteBySchedule,
  myAbsenceNoteBySchedule,
  attendanceDefaultBlock,
  openId,
  type,
  onTypeChange: setType,
  block,
  onBlockChange: setBlock,
}: {
  schedules: ScheduleWithMenus[];
  userId: string;
  myProfile?: AuthorMini;
  viewerBlocks: Block[];
  canEditMenu: boolean;
  canManageAllMenus?: boolean;
  editableMenuBlocks?: Block[];
  canManage?: boolean;
  canDecidePractice?: boolean;
  attendeesBySchedule: Record<string, Attendee[]>;
  myStatusBySchedule: Record<string, AttendanceStatusOrNone>;
  myLateBySchedule: Record<string, boolean>;
  myLateNoteBySchedule: Record<string, string | null>;
  myAbsenceNoteBySchedule: Record<string, string | null>;
  attendanceDefaultBlock: AttendanceDefaultBlock;
  openId?: string;
  type: string;
  onTypeChange: (type: string) => void;
  block: "all" | "middle_long" | "short";
  onBlockChange: (block: "all" | "middle_long" | "short") => void;
}) {

  const items = [
    { key: "all", label: "すべて" },
    ...SCHEDULE_TYPE_OPTIONS.map((o) => ({ key: o.key, label: o.label })),
  ];

  // 自分のブロックの予定しか届かない人には、ブロックの切り替えは意味がないので出さない。
  const showBlockFilter = useMemo(() => ["middle_long", "short"].every((target) =>
    schedules.some((schedule) => schedule.target_blocks.length === 1 && schedule.target_blocks[0] === target)), [schedules]);
  const effectiveBlock = showBlockFilter ? block : "all";
  const filtered = useMemo(
    () => filterSchedules(schedules, type, effectiveBlock),
    [effectiveBlock, schedules, type],
  );

  return (
    <>
      <div className="px-4 pt-1 pb-3 md:px-6 lg:pb-2">
        <div className="flex min-h-9 items-center lg:min-h-8">
          <SegmentedControl items={items} value={type} onChange={setType} className="w-full" />
        </div>
        {showBlockFilter && (
          <div className="mt-2">
            <SegmentedControl
              items={[{ key: "all", label: "全体" }, { key: "middle_long", label: "中長距離" }, { key: "short", label: "短距離" }]}
              value={block}
              onChange={(value) => setBlock(value as typeof block)}
              className="w-full"
            />
          </div>
        )}
      </div>

      <div data-schedule-grid className="px-4 pt-1 md:px-6 lg:grid lg:grid-cols-2 lg:gap-x-6">
        {filtered.length === 0 ? (
          <EmptyState
            title={schedules.length === 0 ? "まだ今後の予定はありません" : "条件に合う予定はありません"}
            action={schedules.length > 0 ? <Button variant="secondary" onClick={() => { setType("all"); setBlock("all"); }}>絞り込みを解除</Button> : undefined}
            className="lg:col-span-2"
          />
        ) : (
          filtered.map((s, index) => {
            const monthKey = s.schedule_date.slice(0, 7);
            const previousMonthKey = filtered[index - 1]?.schedule_date.slice(0, 7);
            const startsMonth = monthKey !== previousMonthKey;

            return (
              <Fragment key={s.id}>
                {startsMonth && (
                  <h2 className={index === 0 ? "section-label mb-2 lg:col-span-2" : "section-label mb-2 mt-7 lg:col-span-2 lg:mt-4"}>
                    {format(new Date(`${s.schedule_date}T00:00:00`), "yyyy年M月")}
                  </h2>
                )}
                <div className="mb-3 min-w-0">
                  <ScheduleCard
                    key={[s.id, (s.menus ?? []).map((menu) => `${menu.id}:${menu.updated_at}`).join(","), myStatusBySchedule[s.id] ?? "none", myLateNoteBySchedule[s.id] ?? "", myAbsenceNoteBySchedule[s.id] ?? "", (attendeesBySchedule[s.id] ?? []).map((a) => [a.user_id, a.attend_date, a.status, a.is_late, a.late_note, a.absence_note].join(":")).join(",")].join("|")}
                    schedule={s}
                    viewerBlocks={viewerBlocks}
                    canEditMenu={canEditMenu}
                    canManageAllMenus={canManageAllMenus}
                    editableMenuBlocks={editableMenuBlocks}
                    canManage={canManage}
                    canDecidePractice={canDecidePractice}
                    userId={userId}
                    myProfile={myProfile}
                    myStatus={myStatusBySchedule[s.id] ?? "none"}
                    myLate={myLateBySchedule[s.id] ?? false}
                    myLateNote={myLateNoteBySchedule[s.id] ?? null}
                    myAbsenceNote={myAbsenceNoteBySchedule[s.id] ?? null}
                    attendees={attendeesBySchedule[s.id] ?? []}
                    attendanceDefaultBlock={attendanceDefaultBlock}
                    defaultOpen={s.id === openId}
                  />
                </div>
              </Fragment>
            );
          })
        )}
      </div>
    </>
  );
}
