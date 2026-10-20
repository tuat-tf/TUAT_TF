import { SettingsSkeleton } from "@/components/ui/page-skeletons";
import { permissionsOf } from "@/lib/permissions";
import { getCurrentProfile, isMemberPreviewActive } from "@/lib/supabase/auth";

export default async function Loading() {
  const [profile, previewingAsMember] = await Promise.all([getCurrentProfile(), isMemberPreviewActive()]);
  return <SettingsSkeleton manageSystem={permissionsOf(profile.roles).manageSystem} previewingAsMember={previewingAsMember} />;
}
