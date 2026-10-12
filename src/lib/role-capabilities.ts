import { BLOCKS } from "./constants";
import { BLOCK_LEADER_ROLES } from "./menu-permissions";
import { canModerateComments } from "./permissions";
import { canManageObMeet } from "./ob-meet";

/** ロール名で適用される権限を、設定と同じ画面で必ず説明する。 */
export function namedRoleCapabilities(name: string): string[] {
  if (canModerateComments([{ name }])) return ["他人のコメント・スプレッドシートの返信を削除できます。本文を編集できるのは投稿者本人です。"];
  if (canManageObMeet([{ name, can_manage_system: false }])) return ["OB戦の登録・懇親会・補助員・組分け・試技順を管理し、変更履歴を閲覧できます。"];
  const block = BLOCK_LEADER_ROLES[name];
  return block ? [`「メニュー作成・編集」も付けると、${BLOCKS[block].label}の他人のメニューを編集できます。他人のメニューの削除には部員・ロール管理権限が必要です。`] : [];
}
