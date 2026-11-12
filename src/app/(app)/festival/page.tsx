import { redirect } from "next/navigation";
import { SubHeader } from "@/components/layout/SubHeader";
import { FestivalBoard } from "@/components/features/festival/FestivalBoard";
import { FESTIVAL_TABS, type FestivalTab } from "@/lib/festival";
import { FestivalRefresh } from "@/components/features/festival/shared";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getFestivalBoard } from "@/lib/queries";
import { permissionsOf } from "@/lib/permissions";

/**
 * 学祭の模擬店（試験機能）。本採用するかは未定なので、システム管理権限だけに見せる。
 * DB側も同じ権限のRLSで守っている（supabase/migrations/20261113020000_festival_trial.sql）。
 */
export default async function FestivalPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const [profile, { tab }] = await Promise.all([getCurrentProfile(), searchParams]);
  if (!permissionsOf(profile.roles).manageSystem) redirect("/home");

  const data = await getFestivalBoard();
  const initialTab = FESTIVAL_TABS.find((key) => key === tab) ?? "sales";

  return (
    <>
      <SubHeader title="学祭" backHref="/admin" right={<FestivalRefresh />} />
      <FestivalBoard data={data} userId={profile.id} initialTab={initialTab satisfies FestivalTab} />
    </>
  );
}
