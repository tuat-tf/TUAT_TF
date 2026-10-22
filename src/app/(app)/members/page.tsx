import { SubHeader } from "@/components/layout/SubHeader";
import { MemberDirectory } from "@/components/features/MemberDirectory";
import { getMemberDirectory } from "@/lib/queries";

export default async function MembersPage() {
  const { members, memberRoles } = await getMemberDirectory();

  return (
    <>
      <SubHeader title="メンバー一覧" backHref="/mypage" />
      <div className="pt-2">
        <MemberDirectory members={members} memberRoles={memberRoles} />
      </div>
    </>
  );
}
