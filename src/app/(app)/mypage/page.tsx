import { canModerateComments } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { Trophy, Medal, Settings, Shield, ShieldCheck, Users, Target, MapPin, ListOrdered, Rss, Flag, CalendarDays } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/card";
import { NavigationList, NavigationLink } from "@/components/ui/navigation-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/common/Avatar";
import { BlockPills } from "@/components/common/BlockPill";
import { Linkify } from "@/components/common/Linkify";
import { ActivityFeed } from "@/components/features/ActivityFeed";
import { MyTrainingChartCached } from "@/components/features/MyTrainingChartCached";
import { getCurrentProfile, getCurrentUserId } from "@/lib/supabase/auth";
import { getUserTrainingRecords, getUserActivity } from "@/lib/queries";
import { gradeShort } from "@/lib/constants";
import { permissionsOf } from "@/lib/permissions";
import { RECORD_SOURCE_COOKIE, recordSourceEnabled } from "@/lib/record-source-display";
import { trainingReviewPreferenceKey } from "@/lib/training-review-display";
import type { RecordFieldDef } from "@/types";
import { ActivitySkeleton, TrainingChartSkeleton } from "@/components/ui/page-skeletons";

export default async function MyPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  // プロフィールを先に表示し、重いグラフと投稿は独立した節で読み込む。
  const userId = await getCurrentUserId();
  const [{ setup }, profile, cookieStore] = await Promise.all([
    searchParams,
    getCurrentProfile(),
    cookies(),
  ]);
  const showRecordSource = recordSourceEnabled(cookieStore.get(RECORD_SOURCE_COOKIE)?.value);

  const perms = permissionsOf(profile.roles);
  if (setup === "1") redirect("/mypage/settings?profile=1&setup=1");
  const showAdminMenu = perms.manageMembers || perms.createSchedule || perms.manageSystem;

  return (
    <>
      <Header
        title="マイページ"
        large

      />

      <div className="px-4 space-y-5 pt-1">
        {/* プロフィールカード */}
        <Card className="p-4 flex items-center gap-4">
          <Avatar
            name={profile.display_name || "?"}
            blocks={profile.blocks}
            avatarUrl={profile.avatar_url}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-title truncate">{profile.display_name || "名前未設定"}</h2>
              <BlockPills blocks={profile.blocks} full />
            </div>
            <p className="text-caption mt-0.5">{gradeShort(profile.grade) ?? "学年未設定"}</p>
            {profile.roles.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {profile.roles.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex items-center gap-0.5 text-micro rounded-full px-2 py-0.5"
                    style={{ color: r.color, backgroundColor: `${r.color}18` }}
                  >
                    <Shield size={10} /> {r.name}
                  </span>
                ))}
              </div>
            )}
            {profile.goal && (
              <p className="text-caption mt-1.5 flex items-start gap-1">
                <Target size={12} className="text-accent mt-[2px] shrink-0" />
                <span className="text-ink whitespace-pre-wrap">
                  <Linkify text={profile.goal} />
                </span>
              </p>
            )}
          </div>
        </Card>

        {/* 練習量の推移（日/週/月・横スライド） */}
        {profile.blocks.includes("middle_long") && (
          <Suspense fallback={<TrainingChartSkeleton />}>
            <MyTraining userId={userId} recordFields={profile.record_fields} initialShowAllFields={cookieStore.get(trainingReviewPreferenceKey(userId))?.value === "1"} />
          </Suspense>
        )}

        {/* リンク（1枚にまとめた区切り線リスト） */}
        <NavigationList>
          <NavigationLink prefetch={false} href="/goals" icon={<Target size={20} className="text-accent" />} label="目標" />
          {/* 大会は全員に。追加・編集・並べ替えは大会画面の中で管理者にだけ出る */}
          <NavigationLink prefetch={false} href="/competitions" icon={<Flag size={20} className="text-accent" />} label="大会" />
          <NavigationLink prefetch={false} href="/mypage/pb" icon={<Medal size={20} className="text-warning" />} label="大会・記録会の結果" />
          <NavigationLink prefetch={false} href="/members" icon={<Users size={20} className="text-accent" />} label="メンバー一覧" />
          <NavigationLink prefetch={false} href="/blog" icon={<Rss size={20} className="text-accent" />} label="ブログ" />
          <NavigationLink prefetch={false} href="/mypage/settings" icon={<Settings size={20} className="text-muted2" />} label="設定" />
        </NavigationList>

        {profile.blocks.includes("middle_long") && (
          <section className="space-y-2">
          <p className="section-label">中長距離</p>
          <NavigationList>
            <NavigationLink
              prefetch={false}
              href="/ranking"
              icon={<Trophy size={20} className="text-warning" />}
              label="走行距離ランキング"
            />
          </NavigationList>
        </section>
        )}

        {/* 管理メニュー（権限に応じて表示） */}
        {showAdminMenu && (
          <section className="space-y-2">
            <p className="section-label">管理メニュー</p>
            <NavigationList>
              {perms.manageSystem && (
                <NavigationLink prefetch={false} href="/admin" icon={<Shield size={20} className="text-accent" />} label="管理ダッシュボード" />
              )}
              {perms.manageMembers && (
                <NavigationLink prefetch={false} href="/admin/members" icon={<ShieldCheck size={20} className="text-accent" />} label="部員・ロール管理" />
              )}
              {perms.createSchedule && (
                <NavigationLink prefetch={false} href="/venues" icon={<MapPin size={20} className="text-accent" />} label="練習場所" />
              )}
              {perms.manageSystem && (
                <>
                  <NavigationLink prefetch={false} href="/mypage/monthly-results" icon={<CalendarDays size={20} className="text-accent" />} label="大会結果（月別・年別・新着）" />
                  <NavigationLink prefetch={false} href="/events" icon={<ListOrdered size={20} className="text-accent" />} label="種目" />
                </>
              )}
            </NavigationList>
          </section>
        )}

        {/* 自分の投稿（記録・つぶやき）— 重いので後から流し込む */}
        <section className="space-y-2">
          <p className="section-label">これまでの投稿</p>
          <Suspense fallback={<ActivitySkeleton />}>
            <MyActivity
              userId={profile.id}
              showRecordSource={perms.manageSystem && showRecordSource}
              currentUser={{
                id: profile.id,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
                systemRecordForm: Boolean(profile.sheet_name),
          canModerateComments: canModerateComments(profile.roles),
              }}
            />
          </Suspense>
        </section>
      </div>
    </>
  );
}

/** グラフを表示する中長距離の部員だけ取得する。 */
async function MyTraining({ userId, recordFields, initialShowAllFields }: { userId: string; recordFields: RecordFieldDef[]; initialShowAllFields: boolean }) {
  const records = await getUserTrainingRecords(userId);
  return <MyTrainingChartCached userId={userId} initialRecords={records} recordFields={recordFields} showIntensitySummary initialShowAllFields={initialShowAllFields} />;
}

/** 自分の投稿一覧（記録＋つぶやき）。Suspense で遅延読み込み */
async function MyActivity({
  userId,
  currentUser,
  showRecordSource,
}: {
  userId: string;
  currentUser: import("@/types").CommentAuthor;
  showRecordSource: boolean;
}) {
  const activity = await getUserActivity(userId, userId);
  if (activity.length === 0) {
    return <EmptyState title="まだ投稿はありません" className="min-h-24 py-4" />;
  }
  return <ActivityFeed activity={activity} currentUser={currentUser} showRecordSource={showRecordSource} />;
}
