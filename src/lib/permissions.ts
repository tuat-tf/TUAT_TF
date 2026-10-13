import type { AppRole, Permission } from "@/types";

/** 権限 → roles テーブルのカラム名 */
export const PERMISSION_COLUMN: Record<Permission, keyof AppRole> = {
  manage_system: "can_manage_system",
  manage_members: "can_manage_members",
  moderate_comments: "can_moderate_comments",
  manage_ob_meet: "can_manage_ob_meet",
  create_schedule: "can_create_schedule",
  create_menu: "can_create_menu",
  create_notice: "can_create_notice",
  decide_practice: "can_decide_practice",
};

/** ロール作成・編集フォームで使う権限の一覧（表示順） */
export const PERMISSION_LIST: { key: Permission; label: string; desc: string }[] = [
  { key: "manage_system", label: "システム・大会管理", desc: "システム設定、大会・種目・プログラムを管理できます。全ノートを閲覧でき、自分のお知らせも通知されます。OB戦の担当操作にはOB戦の運営管理権限も必要です。" },
  { key: "manage_members", label: "部員・ロール管理", desc: "部員とロールを管理できます。他人のメニュー・ノート・スレッドの編集・削除もできます。コメント・返信の削除は別権限です。" },
  { key: "moderate_comments", label: "コメント・返信の削除", desc: "アプリに投稿された他人のコメント・返信を削除できます。本文を編集できるのは投稿者本人です。" },
  { key: "manage_ob_meet", label: "OB戦の登録・運営管理", desc: "結果入力を含むOB戦の登録・懇親会・補助担当・組分け・試技順を管理し、変更履歴を閲覧できます。" },
  { key: "create_schedule", label: "予定・練習場所の管理", desc: "予定の作成と、他人の予定を含む編集・削除ができます。練習場所も管理できます。大会そのものの管理にはシステム管理権限が必要です。" },
  { key: "create_menu", label: "メニュー作成・編集", desc: "メニューの作成と、自分のメニューの編集・削除ができます。中長距離のスプレッドシートのメニューも編集できます。編集範囲を設定すると、そのブロックの他人のメニューも編集できます。" },
  { key: "create_notice", label: "お知らせ作成・編集・削除", desc: "お知らせの作成と、他人のお知らせを含む編集・削除ができます。「全員」ロールに付けると、全員が操作できます。" },
  { key: "decide_practice", label: "練習の開催状況・中止", desc: "開催判断中などの状況を出欠欄に表示できます。練習予定の中止と、中止の取り消しもできます。" },
];

/** 所属ロールのいずれかが該当権限を持つか（権限は OR で合算） */
export function hasPermission(
  roles: AppRole[] | undefined | null,
  perm: Permission,
): boolean {
  const col = PERMISSION_COLUMN[perm];
  return (roles ?? []).some((r) => !r.permissions_suppressed && Boolean(r[col]));
}

/** よく使う権限セットをまとめて算出 */
export function permissionsOf(roles: AppRole[] | undefined | null) {
  return {
    manageSystem: hasPermission(roles, "manage_system"),
    manageMembers: hasPermission(roles, "manage_members"),
    moderateComments: hasPermission(roles, "moderate_comments"),
    manageObMeet: hasPermission(roles, "manage_ob_meet"),
    createSchedule: hasPermission(roles, "create_schedule"),
    createMenu: hasPermission(roles, "create_menu"),
    createNotice: hasPermission(roles, "create_notice"),
    decidePractice: hasPermission(roles, "decide_practice"),
  };
}

/** コメント削除権限。本文の編集権限は投稿者だけに保持する。 */
export function canModerateComments(roles: AppRole[] | undefined | null): boolean {
  return hasPermission(roles, "moderate_comments");
}
