import { notFound, redirect } from "next/navigation";
import { SubHeader } from "@/components/layout/SubHeader";
import { AdminSheetSettingsDetail } from "@/components/features/AdminSheetSettingsDetail";
import { getMemberSheetSettingsById } from "@/lib/queries";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { permissionsOf } from "@/lib/permissions";

export default async function AdminMemberSheetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const profile = await getCurrentProfile();
  if (!permissionsOf(profile.roles).manageSystem) redirect("/home");
  const { id } = await params;
  const fromManagement = (await searchParams).from === "management" && permissionsOf(profile.roles).manageMembers;
  const member = await getMemberSheetSettingsById(id);
  if (!member) notFound();
  return <>
    <SubHeader title="スプレッドシート連携" backHref={fromManagement ? `/admin/members?member=${id}` : "/admin/sheets"} />
    <AdminSheetSettingsDetail key={member.id} member={member} />
  </>;
}
