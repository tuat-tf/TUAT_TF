import { Suspense } from "react";
import { cookies } from "next/headers";
import { SubHeader } from "@/components/layout/SubHeader";
import { TimelineSearch } from "@/components/features/TimelineSearch";
import { FeedSkeleton } from "@/components/ui/page-skeletons";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { canModerateComments, permissionsOf } from "@/lib/permissions";
import { RECORD_SOURCE_COOKIE, showRecordSourceFor } from "@/lib/record-source-display";

/** タイムラインの検索。#タグ のリンクもここ（?q=%23タグ）を開く。 */
export default function TimelineSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  return (
    <>
      <SubHeader title="検索" backHref="/timeline" />
      <Suspense fallback={<FeedSkeleton withHeader={false} />}>
        <SearchContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SearchContent({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const [profile, cookieStore, params] = await Promise.all([getCurrentProfile(), cookies(), searchParams]);
  const query = (Array.isArray(params.q) ? params.q[0] : params.q) ?? "";
  const showRecordSource = showRecordSourceFor(
    permissionsOf(profile.roles).manageSystem,
    cookieStore.get(RECORD_SOURCE_COOKIE)?.value,
  );
  return (
    <TimelineSearch
      // A tapped #tag link opens a new query: start over instead of keeping the typed text.
      key={query}
      initialQuery={query}
      currentUser={{
        id: profile.id,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        systemRecordForm: Boolean(profile.sheet_name),
        canModerateComments: canModerateComments(profile.roles),
      }}
      showRecordSource={showRecordSource}
    />
  );
}
