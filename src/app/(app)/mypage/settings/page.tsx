import { ChevronRight, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { SubHeader } from "@/components/layout/SubHeader";
import { Card } from "@/components/ui/card";
import { SettingsGroup } from "@/components/features/SettingsGroup";
import { AttendanceViewSetting } from "@/components/features/AttendanceViewSetting";
import { TimelineViewSetting } from "@/components/features/TimelineViewSetting";
import { MenuViewSetting } from "@/components/features/MenuViewSetting";
import { ScheduleViewSetting } from "@/components/features/ScheduleViewSetting";
import { SplashIntroSetting } from "@/components/features/SplashIntroSetting";
import { NotificationSettings } from "@/components/features/NotificationSettings";
import { MemberPreviewSetting } from "@/components/features/MemberPreviewSetting";

import { EditProfileButton } from "@/components/features/MyPageActions";
import { SHEET_INPUT_MODE_LABELS } from "@/lib/sheet-input-mode";
import { SHEET_SETUP_PATH } from "@/lib/sheet-period";
import { getCurrentProfile, isMemberPreviewActive } from "@/lib/supabase/auth";

/**
 * 設定画面。マイページの中で展開する形だと項目が増えすぎて詰まって見えたため、
 * 独立したページに分けて「表示 / 通知 / 練習記録」へグループ分けした。
 * 行の見た目は1種類に統一し、上ほどよく触る項目を置いている。
 */
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ profile?: string; setup?: string }> }) {
  const params = await searchParams;
  const profile = await getCurrentProfile();
  const previewingAsMember = await isMemberPreviewActive();

  return (
    <>
      <SubHeader title="自分の設定" backHref="/mypage" />

      <div className="space-y-5 px-4 pb-6 pt-1">
        {/* プレビュー中は管理者向けが全部隠れるので、戻す導線を最初に出す */}
        {previewingAsMember && <MemberPreviewSetting previewing />}

        <Section title="プロフィール" collapsible defaultOpen={params.profile === "1" || params.setup === "1"}>
          <EditProfileButton profile={profile} settingsRow autoOpen={params.profile === "1" || params.setup === "1"} />
        </Section>

        <Section title="表示" collapsible>
          <AttendanceViewSetting userId={profile.id} initial={profile.attendance_default_block} />
          <TimelineViewSetting userId={profile.id} initial={profile.timeline_default_block} />
          <ScheduleViewSetting userId={profile.id} initial={profile.schedule_view_all_blocks ?? false} />
          <MenuViewSetting userId={profile.id} initial={profile.menu_view_all_blocks ?? false} />
          <SplashIntroSetting />
        </Section>

        <Section title="通知" collapsible>
          <NotificationSettings
            profileId={profile.id}
            initialComment={profile.notify_comment ?? true}
            initialNotice={profile.notify_notice ?? true}
            initialMention={profile.notify_mention ?? true}
          />
        </Section>

        <Section title="練習記録" id="practice-record-settings" collapsible>
          <Link data-ui-row href={SHEET_SETUP_PATH} prefetch={false} className="flex items-center gap-3 px-4 py-3 active:bg-bg">
              <SlidersHorizontal size={19} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium">自分の記録の入力設定</span>
                <span className="block text-micro text-muted">{profile.sheet_transition ? `現在: ${SHEET_INPUT_MODE_LABELS[profile.sheet_transition.mode]}` : "10月以降の設定を確認してください"}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" />
          </Link>
        </Section>


      </div>
    </>
  );
}

/** 見出し＋区切り線つきカード。設定はすべてこの形で並べる。 */
function Section({ title, children, id, collapsible = false, defaultOpen = false }: {
  title: string; children: React.ReactNode; id?: string; collapsible?: boolean; defaultOpen?: boolean;
}) {
  if (collapsible) {
    return <SettingsGroup title={title} id={id} defaultOpen={defaultOpen}>
      <div className="divide-y divide-separator/70">{children}</div>
    </SettingsGroup>;
  }
  return (
    <section id={id} className="scroll-mt-20 space-y-2">
      <p className="section-label">{title}</p>
      <Card className="divide-y divide-separator/70 overflow-hidden">{children}</Card>
    </section>
  );
}
