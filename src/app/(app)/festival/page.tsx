import { redirect } from "next/navigation";
import { SubHeader } from "@/components/layout/SubHeader";
import { FestivalBoard } from "@/components/features/festival/FestivalBoard";
import { FESTIVAL_TABS, type FestivalTab } from "@/lib/festival";
import { FestivalRefresh } from "@/components/features/festival/shared";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getFestivalBoard } from "@/lib/queries";
import { permissionsOf } from "@/lib/permissions";

/**
 * 学祭の模擬店。ロールの「学祭」「学祭の店長」の権限を持つ部員に見せる。
 * DB側も同じ権限のRLSで守っている（supabase/migrations/20261113040000_festival_roles.sql）。
 */
export default async function FestivalPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [profile, { tab }] = await Promise.all([getCurrentProfile(), searchParams]);
  const perms = permissionsOf(profile.roles);
  if (!perms.useFestival) redirect("/home");

  const data = await getFestivalBoard({ manager: perms.manageFestival });
  const initialTab = FESTIVAL_TABS.find((key) => key === tab) ?? "summary";

  return (
    <>
      <SubHeader title="学祭" backHref="/mypage" right={<FestivalRefresh />} />
      <FestivalBoard data={data} userId={profile.id} manager={perms.manageFestival} initialTab={initialTab satisfies FestivalTab} />
    </>
  );
}
