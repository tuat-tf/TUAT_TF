import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { AttendanceToggle, type AttendanceChange } from "@/components/features/AttendanceToggle";
import { AttendeesButton } from "@/components/features/AttendeesButton";
import type { Attendee, AttendanceDefaultBlock } from "@/types";

/** 各日の出欠を表示する。回答の状態と更新処理は予定カード側で保持する。 */
export function ScheduleAttendance({
  scheduleId,
  userId,
  attendanceDays,
  multiDayAttendance,
  attendeesState,
  attendanceDefaultBlock,
  handleAttendanceChanged,
  className = "-mt-1 space-y-2 px-4 pb-3 lg:px-3 lg:pb-2.5",
}: {
  scheduleId: string;
  userId: string;
  attendanceDays: string[];
  multiDayAttendance: boolean;
  attendeesState: Attendee[];
  attendanceDefaultBlock: AttendanceDefaultBlock;
  handleAttendanceChanged: (day: string, change: AttendanceChange) => void;
  className?: string;
}) {
  return (
    <div className={className}>
          {attendanceDays.map((day) => {
            // 出欠は日ごとに数える。複数日開催の各日をまとめると同じ人が日数ぶん並ぶ。
            const dayAttendees = attendeesState.filter((a) => a.attend_date === day);
            const mine = attendeesState.find(
              (a) => a.user_id === userId && a.attend_date === day,
            );
            const status = mine?.status ?? "none";
            return (
              <div key={day} className="space-y-2">
                {multiDayAttendance && (
                  <p className="text-caption font-medium">
                    {format(new Date(`${day}T00:00:00`), "M/d (E)", { locale: ja })}
                  </p>
                )}

                  <AttendanceToggle
                    scheduleId={scheduleId}
                    attendDate={day}
                    userId={userId}
                    initial={status}
                    initialLate={mine?.is_late ?? false}
                    initialLateNote={mine?.late_note ?? null}
                    initialAbsenceNote={mine?.absence_note ?? null}
                    summary={<AttendeesButton attendees={dayAttendees} defaultBlock={attendanceDefaultBlock} />}
                    onChanged={(change) => handleAttendanceChanged(day, change)}
                  />

              </div>
            );
          })}
        </div>
  );
}
