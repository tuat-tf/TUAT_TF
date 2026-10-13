import { redirect } from "next/navigation";
import { SubHeader } from "@/components/layout/SubHeader";
import { AdminDashboard } from "@/components/features/AdminDashboard";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getAdminDashboard } from "@/lib/queries";
import { permissionsOf } from "@/lib/permissions";

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  const permissions = permissionsOf(profile.roles);
  if (!permissions.manageSystem) redirect(permissions.manageMembers ? "/admin/members" : "/home");

  const snapshot = await getAdminDashboard();
  return <>
    <SubHeader title="管理ダッシュボード" backHref="/mypage" />
    <AdminDashboard snapshot={snapshot} permissions={permissions} />
  </>;
}
