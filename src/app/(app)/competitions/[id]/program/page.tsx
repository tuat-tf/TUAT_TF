import { notFound } from "next/navigation";
import { SubHeader } from "@/components/layout/SubHeader";
import { CompetitionProgramView } from "@/components/features/CompetitionProgramView";
import { getCurrentProfile, isMemberPreviewActive } from "@/lib/supabase/auth";
import { getCompetitionById, getCompetitionProgramEntries } from "@/lib/queries";
import { isObCompetition } from "@/lib/ob-meet";
import { permissionsOf } from "@/lib/permissions";
import { getCompetitionMeet } from "@/lib/queries/competition-meet";
import { CompetitionMeetResults } from "@/components/features/CompetitionMeetResults";

export default async function CompetitionProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; view?: string; section?: string }>;
}) {
  const { id } = await params;
  const [profile, competition, preview] = await Promise.all([
    getCurrentProfile(),
    getCompetitionById(id),
    isMemberPreviewActive(),
  ]);
  if (!competition) notFound();
  const canManage = permissionsOf(profile.roles).manageSystem;
  // 開いた元へ戻る。直接URLを開いた場合だけホームを使う。
  const header = isObCompetition(competition.id)
    ? <SubHeader title={competition.name} backHref="/home" />
    : <SubHeader title={competition.name} backHref={`/competitions/${competition.id}`} />;

  // The activated OB source is immutable. A missing canonical snapshot must
  // never reopen the old editor or silently publish its pre-migration results.
  if (isObCompetition(competition.id) || !competition.program_source_url) {
    const managed = await getCompetitionMeet(id);
    if (managed) return <>{header}<CompetitionMeetResults meet={managed} date={competition.starts_on} endsOn={competition.ends_on} canOperate={managed.permissions.manage && !preview} /></>;
    if (isObCompetition(competition.id)) throw new Error("大会データの移行状態を確認できませんでした");
  }
  const entries = await getCompetitionProgramEntries(id);

  return (
    <>
      {header}
      <CompetitionProgramView
        competition={competition}
        initialEntries={entries}
        canManage={canManage}
      />
    </>
  );
}
