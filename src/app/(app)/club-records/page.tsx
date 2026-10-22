import { ChevronRight, ExternalLink, Trophy } from "lucide-react";
import { SubHeader } from "@/components/layout/SubHeader";
import { NavigationList, NavigationLink } from "@/components/ui/navigation-list";
import { CLUB_RECORDS_HOME, CLUB_RECORD_SOURCES } from "@/lib/club-records";
import { getCurrentUserId } from "@/lib/supabase/auth";

export default async function ClubRecordsPage() {
  await getCurrentUserId();
  return <>
    <SubHeader title="歴代十傑" backHref="/mypage" />
    <main className="space-y-5 px-4 pb-6 pt-1 md:px-6">
      <div><p className="text-headline">東京農工大学陸上競技部 歴代十傑</p><p className="mt-1 text-caption text-muted">公式サイトの記録を種目別に見られます。</p></div>
      {(["men", "women"] as const).map((gender) => <section key={gender} className="space-y-2" aria-labelledby={`records-${gender}`}>
        <h2 id={`records-${gender}`} className="section-label">{gender === "men" ? "男子" : "女子"}</h2>
        <NavigationList>{CLUB_RECORD_SOURCES.filter((source) => source.gender === gender).map((source) => <NavigationLink key={source.id} href={`/club-records/${source.id}`} prefetch={false} label={source.category} icon={<Trophy size={19} className="text-warning" />} />)}</NavigationList>
      </section>)}
      <a href={CLUB_RECORDS_HOME} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 text-caption text-accent"><ExternalLink size={16} />公式サイトを開く<ChevronRight size={15} /></a>
    </main>
  </>;
}
