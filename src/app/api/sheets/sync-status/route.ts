import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { fetchRolesByProfileIds } from "@/lib/supabase/auth";
import { permissionsOf } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { MEMBER_PREVIEW_COOKIE } from "@/lib/member-preview";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function auditTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!parts) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const offsetMinutes = parts[8] === "Z" ? 0 : (Number(parts[10]) * 60 + Number(parts[11])) * (parts[9] === "+" ? 1 : -1);
  const local = new Date(milliseconds + offsetMinutes * 60_000);
  // Date.parse normalizes nonexistent calendar dates; audit metadata must fail closed.
  if (local.getUTCFullYear() !== Number(parts[1]) || local.getUTCMonth() + 1 !== Number(parts[2])
    || local.getUTCDate() !== Number(parts[3]) || local.getUTCHours() !== Number(parts[4])
    || local.getUTCMinutes() !== Number(parts[5]) || local.getUTCSeconds() !== Number(parts[6])) return null;
  return { milliseconds, microseconds: Number((parts[7] ?? "").padEnd(6, "0").slice(3)) };
}

function isResolvedFailure(failure: unknown, finishedAt: ReturnType<typeof auditTimestamp>) {
  if (!finishedAt || !failure || typeof failure !== "object" || Array.isArray(failure)) return false;
  const audit = failure as Record<string, unknown>;
  if (typeof audit.member !== "string" || !audit.member.trim()
    || typeof audit.reason !== "string" || !audit.reason.trim()
    || audit.resolution !== "verified_writable_cells_match") return false;
  const resolvedAt = auditTimestamp(audit.resolved_at);
  // Keep PostgreSQL microseconds when comparing an audit with the run's completion.
  return !!resolvedAt && (resolvedAt.milliseconds > finishedAt.milliseconds
    || (resolvedAt.milliseconds === finishedAt.milliseconds && resolvedAt.microseconds >= finishedAt.microseconds));
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "認証が必要です" }, { status: 401, headers });
    const roles = await fetchRolesByProfileIds(supabase, [user.id]);
    const permissions = permissionsOf(roles.get(user.id));
    if ((!permissions.manageSystem && !permissions.manageMembers)
      || (await cookies()).get(MEMBER_PREVIEW_COOKIE)?.value === "1") {
      return NextResponse.json({ error: "管理権限が必要です" }, { status: 403, headers });
    }

    const admin = createAdminClient();
    const [runsResult, pendingResult, profilesResult] = await Promise.all([
      admin.from("sheet_sync_runs").select("status, started_at, finished_at, pulled_count, pushed_count, failed_members").order("started_at", { ascending: false }).limit(1),
      admin.from("practice_records").select("id", { count: "exact", head: true }).eq("pending_sheet_push", true),
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("record_source", "sheet"),
    ]);
    if (runsResult.error || !Array.isArray(runsResult.data) || pendingResult.error || profilesResult.error
      || !isCount(pendingResult.count) || !isCount(profilesResult.count)) throw new Error("Incomplete sync status");

    const latest = runsResult.data[0] ?? null;
    if (latest && (!isCount(latest.pulled_count) || !isCount(latest.pushed_count)
      || !Array.isArray(latest.failed_members))) throw new Error("Incomplete sync run");
    const failedMembers = Array.isArray(latest?.failed_members) ? latest.failed_members : [];
    const finishedAt = auditTimestamp(latest?.finished_at);
    const resolvedCount = failedMembers.filter(failure => isResolvedFailure(failure, finishedAt)).length;
    const failedCount = failedMembers.length - resolvedCount;
    return NextResponse.json({
      latest: latest && {
        status: latest.status,
        startedAt: latest.started_at,
        finishedAt: latest.finished_at,
        pulledCount: latest.pulled_count,
        pushedCount: latest.pushed_count,
        failedCount,
        rawFailedCount: failedMembers.length,
        resolvedCount,
        hasIssue: failedCount > 0 || (latest.status === "error" && failedMembers.length === 0),
      },
      pendingPushCount: pendingResult.count,
      sheetProfileCount: profilesResult.count,
    }, { headers });
  } catch {
    return NextResponse.json({ error: "同期状態を取得できませんでした。時間をおいて再確認してください。" }, { status: 503, headers });
  }
}
