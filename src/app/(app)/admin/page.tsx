import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { SubHeader } from "@/components/layout/SubHeader";
import { AdminDashboard } from "@/components/features/AdminDashboard";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getAdminDashboard } from "@/lib/queries";
import { permissionsOf } from "@/lib/permissions";
import { RECORD_SOURCE_COOKIE, recordSourceEnabled } from "@/lib/record-source-display";

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  const permissions = permissionsOf(profile.roles);
  if (!permissions.manageSystem && !permissions.manageMembers && !permissions.createSchedule) redirect("/home");

  const [snapshot, cookieStore] = await Promise.all([
    permissions.manageSystem ? getAdminDashboard() : Promise.resolve(null),
    cookies(),
  ]);
  return <>
    <SubHeader title="管理" backHref="/mypage" />
    <AdminDashboard snapshot={snapshot} permissions={permissions} showRecordSource={recordSourceEnabled(cookieStore.get(RECORD_SOURCE_COOKIE)?.value)} />
  </>;
}
