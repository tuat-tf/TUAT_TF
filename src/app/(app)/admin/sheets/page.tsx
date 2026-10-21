import { redirect } from "next/navigation";
import { SubHeader } from "@/components/layout/SubHeader";
import { SystemSyncStatus } from "@/components/features/SystemSyncStatus";
import { AdminSheetSettings } from "@/components/features/AdminSheetSettings";
import { getMemberSheetSettings } from "@/lib/queries";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { permissionsOf } from "@/lib/permissions";

export default async function AdminSheetSettingsPage() {
  const profile = await getCurrentProfile();
  if (!permissionsOf(profile.roles).manageSystem) redirect("/home");
  const members = await getMemberSheetSettings();

  return <>
    <SubHeader title="スプレッドシート連携" backHref="/admin" />
    <div className="px-4 pb-4"><SystemSyncStatus /></div>
    <AdminSheetSettings members={members} />
  </>;
}
