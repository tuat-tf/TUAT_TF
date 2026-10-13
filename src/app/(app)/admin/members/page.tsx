import { redirect } from "next/navigation";
import { SubHeader } from "@/components/layout/SubHeader";
import { RoleManager } from "@/components/features/RoleManager";
import { AdminMemberList } from "@/components/features/AdminMemberList";
import { LoginAllowlist } from "@/components/features/LoginAllowlist";
import { getCurrentProfile } from "@/lib/supabase/auth";
import { getAllProfiles, getAllRoleCategories, getAllRoles, getLoginAllowedEmails } from "@/lib/queries";
import { permissionsOf } from "@/lib/permissions";

export default async function AdminPage() {
  const profile = await getCurrentProfile();
  const permissions = permissionsOf(profile.roles);
  if (!permissions.manageMembers) redirect("/home");

  const [members, roles, categories, allowedEmails] = await Promise.all([
    getAllProfiles(),
    getAllRoles(),
    getAllRoleCategories(),
    getLoginAllowedEmails(),
  ]);

  return (
    <>
      <SubHeader title="部員・ロール管理" backHref={permissions.manageSystem ? "/admin" : "/mypage"} />

      <div className="px-4 pt-2 space-y-6">
        <section className="space-y-2">
          <p className="section-label">ログイン許可リスト</p>
          <p className="text-caption">大学のアカウントがない人のGoogleアカウントを登録できます。大学アカウントは登録不要です。</p>
          <LoginAllowlist entries={allowedEmails} />
        </section>
        <section className="space-y-2">
          <p className="section-label">ロール</p>
          <p className="text-caption">
            許可する操作を「管理」「日々の活動」にまとめて設定できます。メニューの編集範囲も指定でき、1人に複数のロールを付けられます。
          </p>
          <RoleManager
            roles={roles}
            members={members}
            categories={categories}
            canManageSystem={permissions.manageSystem}
          />
        </section>

        <section className="space-y-2">
          <p className="section-label">部員</p>
          <p className="text-caption">各部員にロールを付与・解除できます。</p>
          <AdminMemberList members={members} roles={roles} canManageSystem={permissions.manageSystem} />
        </section>
      </div>
    </>
  );
}
