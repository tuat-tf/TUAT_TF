"use client";

import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Avatar } from "@/components/common/Avatar";
import { SegmentedControl } from "@/components/ui/segmented";
import { BLOCKS, GRADE_OPTIONS, SIMPLE_BLOCK_ITEMS, gradeShort, matchSimpleBlock } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AttendanceDefaultBlock, Attendee } from "@/types";

/** ブロックの絞り込み後、学年→名前の順に並べる。 */
function sortAttendees(list: Attendee[]): Attendee[] {
  const gradeIdx = (a: Attendee) => {
    const i = GRADE_OPTIONS.findIndex((g) => g.value === a.profile.grade);
    return i < 0 ? 99 : i;
  };
  return [...list].sort(
    (a, b) =>
      gradeIdx(a) - gradeIdx(b) ||
      (a.profile.display_name || "").localeCompare(b.profile.display_name || "", "ja"),
  );
}

/**
 * 出欠人数を「出欠一覧の初期表示」で選んだブロックに合わせて数える。
 * マネージャーは中長距離・短距離のどちらでも数える（matchSimpleBlock の仕様）。
 */
export function attendanceCounts(
  attendees: Attendee[],
  block: AttendanceDefaultBlock,
): { present: number; absent: number } {
  let present = 0;
  let absent = 0;
  for (const attendee of attendees) {
    if (!matchSimpleBlock(attendee.profile.blocks, block)) continue;
    if (attendee.status === "present") present += 1;
    else if (attendee.status === "absent") absent += 1;
  }
  return { present, absent };
}

/** 「出席◯」表示。タップで出席者・欠席者一覧 */
export function AttendeesButton({
  attendees,
  defaultBlock,
}: {
  attendees: Attendee[];
  defaultBlock: AttendanceDefaultBlock;
}) {
  const [open, setOpen] = useState(false);
  const [block, setBlock] = useState<AttendanceDefaultBlock>(defaultBlock);

  const visible = attendees.filter((attendee) =>
    matchSimpleBlock(attendee.profile.blocks, block),
  );
  const present = sortAttendees(visible.filter((a) => a.status === "present"));
  const absent = sortAttendees(visible.filter((a) => a.status === "absent"));
  // ボタンの人数は「出欠一覧の初期表示」で選んだブロックに固定する。
  // シート内でタブを切り替えても、閉じたあとの表示は設定どおりに戻す。
  const counted = attendanceCounts(attendees, defaultBlock);

  return (
    <>
      <button
        type="button"
        data-system-glass
        data-glass-control
        data-glass-attendance={"summary"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`出欠一覧（出席${counted.present}人、欠席${counted.absent}人）`}
        onClick={(e) => {
          setBlock(defaultBlock);
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex h-11 min-h-11 w-full min-w-0 flex-wrap content-center items-center justify-center gap-x-1 rounded-full bg-bg border border-separator px-2 text-[13px] font-semibold leading-tight text-muted2 pressable"
      >
        {/* 0でも消さず常に表示。数字は等幅＋2桁ぶんの固定幅で桁が増えてもガクつかない。 */}
        <span className="whitespace-nowrap text-success">
          出席 <span className="inline-block min-w-[2ch] text-right tabular-nums">{counted.present}</span>
        </span>
        <span className="whitespace-nowrap text-danger">
          欠席 <span className="inline-block min-w-[2ch] text-right tabular-nums">{counted.absent}</span>
        </span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          title="出欠"
          className="flex h-[calc(100dvh-12px)] flex-col"
          bodyClassName="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 pb-3">
            <SegmentedControl items={SIMPLE_BLOCK_ITEMS} value={block} onChange={setBlock} />
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
            <Group title={`出席 ${present.length}`} color="#34c759" list={present} />
            {absent.length > 0 && <Group title={`欠席 ${absent.length}`} color="#ff3b30" list={absent} />}
            {visible.length === 0 && (
              <p className="text-caption text-center py-6">まだ誰も出欠を登録していません</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Group({ title, color, list }: { title: string; color: string; list: Attendee[] }) {
  const grades = [...new Set(list.map((attendee) => attendee.profile.grade || null))];
  if (list.length === 0) return null;
  return (
    <div className="space-y-3">
      <p className="section-label" style={{ color }}>{title}</p>
      {grades.map((grade) => {
        const gradeMembers = list.filter((attendee) => (attendee.profile.grade || null) === grade);
        return (
          <div key={grade ?? "unset"} className="rounded-xl bg-bg/60 px-3 py-2">
            <p className="text-[12px] font-semibold text-muted2">{gradeShort(grade) ?? "学年未設定"}</p>
            <div className="divide-y divide-separator/60">
              {gradeMembers.map((attendee) => (
                <div key={attendee.user_id} className="flex min-h-10 items-start gap-2.5 py-1.5">
                  <Avatar name={attendee.profile.display_name} blocks={attendee.profile.blocks} avatarUrl={attendee.profile.avatar_url} size="sm" />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className={cn("flex items-center gap-1.5 truncate text-[14px] font-semibold", attendee.is_late && "text-warning")}>
                      <span className="truncate">{attendee.profile.display_name || "名無し"}</span>
                      {attendee.is_late && <span className="shrink-0 text-caption text-warning">遅刻</span>}
                      {(attendee.profile.blocks ?? []).includes("manager") && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                          style={{ color: BLOCKS.manager.color, backgroundColor: BLOCKS.manager.bg }}
                        >
                          {BLOCKS.manager.short}
                        </span>
                      )}
                    </p>
                    {attendee.late_note && (
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-muted2">{attendee.late_note}</p>
                    )}
                    {attendee.status === "absent" && attendee.absence_note && (
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-muted2">{attendee.absence_note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
