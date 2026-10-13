import Link from "next/link";
import { Activity, Bell, BookOpen, CalendarDays, Flag, ListOrdered, MapPin, MessageCircle, NotebookPen, Settings, ShieldCheck, Users } from "lucide-react";
import { NavigationList, NavigationLink } from "@/components/ui/navigation-list";
import { DashboardRefresh } from "@/components/features/DashboardRefresh";
import { ServiceStatusPanel } from "@/components/features/ServiceStatusPanel";
import { SystemSyncStatus } from "@/components/features/SystemSyncStatus";
import type { AdminDashboardSnapshot } from "@/lib/queries/admin-dashboard";
import type { permissionsOf } from "@/lib/permissions";

type Props = { snapshot: AdminDashboardSnapshot; permissions: ReturnType<typeof permissionsOf> };

export function AdminDashboard({ snapshot, permissions }: Props) {
  const { metrics } = snapshot;
  const period = `${snapshot.since.replaceAll("-", "/")} ～ ${snapshot.today.replaceAll("-", "/")}`;
  return <div className="space-y-6 px-4 pb-8 pt-2">
    <section aria-labelledby="dashboard-overview" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="dashboard-overview" className="text-base font-bold">全体の状況</h2>
          <p className="text-caption">利用状況の確認と各機能の管理ができます。</p>
        </div>
        <DashboardRefresh />
      </div>
      <p className="text-micro text-muted">取得日時: {new Date(snapshot.checkedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}（日本時間）</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Metric label="在籍部員" value={metrics.activeMembers} unit="人" detail="承認済み・在籍中" href={permissions.manageMembers ? "/admin/members" : "/members"} icon={<Users size={18} />} />
        <Metric label="追加された練習記録" value={metrics.recentRecords} unit="件" detail="過去7日・シート取込を含みます" href="/timeline" icon={<NotebookPen size={18} />} />
        <Metric label="つぶやき" value={metrics.recentTweets} unit="件" detail="過去7日・期限内の投稿" href="/timeline" icon={<MessageCircle size={18} />} />
        <Metric label="開催中・今後の予定" value={metrics.upcomingSchedules} unit="件" detail="本日以降・複数日の予定を含みます" href="/schedule" icon={<CalendarDays size={18} />} />
        <Metric label="開催中・今後の大会" value={metrics.upcomingCompetitions} unit="件" detail="本日以降" href="/competitions" icon={<Flag size={18} />} />
        <Metric label="新しいお知らせ" value={metrics.recentNotices} unit="件" detail="過去7日" href="/notices" icon={<Bell size={18} />} />
      </div>
      <p className="text-micro text-muted">過去7日: {period}（日本時間・本日を含みます）。閲覧できるデータを集計しています。</p>
      {snapshot.unavailable.length > 0 && <p role="alert" className="text-sm text-danger">一部の件数を取得できませんでした。画面上部の「再確認」で再読み込みしてください。</p>}
    </section>

    <section aria-labelledby="dashboard-management" className="space-y-2">
      <h2 id="dashboard-management" className="section-label">各機能の管理</h2>
      <NavigationList>
        {permissions.manageMembers && <NavigationLink href="/admin/members" label="部員・ロール" description="所属・権限の確認と変更" icon={<ShieldCheck size={20} />} />}
        <NavigationLink href="/competitions" label="大会" description="大会・出場・プログラム・補助担当" icon={<Flag size={20} />} />
        <NavigationLink href="/mypage/monthly-results" label="大会・記録会の結果" description="月別・年別・新着の結果" icon={<Activity size={20} />} />
        <NavigationLink href="/schedule" label="予定・出欠" description="練習・イベントの予定と回答" icon={<CalendarDays size={20} />} />
        {permissions.createSchedule && <NavigationLink href="/venues" label="練習場所" description="集合場所・アクセスの管理" icon={<MapPin size={20} />} />}
        <NavigationLink href="/notices" label="お知らせ" description="お知らせ・通知の確認" icon={<Bell size={20} />} />
        <NavigationLink href="/timeline" label="練習記録・つぶやき" description="部員の投稿・コメントの確認" icon={<NotebookPen size={20} />} />
        <NavigationLink href="/notes" label="ノート" description="共有記事・スレッドの確認" icon={<BookOpen size={20} />} />
        <NavigationLink href="/events" label="種目" description="大会の種目一覧の管理" icon={<ListOrdered size={20} />} />
        <NavigationLink href="/mypage/settings" label="システム設定" description="表示の確認・一般部員プレビュー・旧アプリ" icon={<Settings size={20} />} />
      </NavigationList>
    </section>

    <section aria-labelledby="dashboard-sync" className="space-y-2">
      <h2 id="dashboard-sync" className="section-label">スプレッドシート連携</h2>
      <SystemSyncStatus />
    </section>

    <section id="services" aria-labelledby="dashboard-services" className="scroll-mt-20 space-y-2">
      <h2 id="dashboard-services" className="section-label">サービスの状態・使用量</h2>
      <ServiceStatusPanel embedded />
    </section>
  </div>;
}

function Metric({ label, value, unit, detail, href, icon }: { label: string; value: number | null; unit: string; detail: string; href: string; icon: React.ReactNode }) {
  return <Link href={href} data-ui-row className="min-w-0 rounded-card border border-separator/70 bg-card p-3">
    <div className="mb-2 flex items-center gap-2 text-accent">{icon}<span className="text-micro font-medium text-muted">{label}</span></div>
    <p className="text-2xl font-bold tabular-nums">{value === null ? <span className="text-sm font-medium text-muted">取得できません</span> : <>{value.toLocaleString("ja-JP")}<span className="ml-1 text-sm font-medium text-muted">{unit}</span></>}</p>
    <p className="mt-1 text-micro text-muted">{detail}</p>
  </Link>;
}
