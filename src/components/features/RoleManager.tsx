"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, FolderPlus, Lock, Plus, SlidersHorizontal, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PersonPicker } from "@/components/features/PersonPicker";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormDraftGuard, FormModal, FormModalFooter } from "@/components/ui/form-modal";
import { Input } from "@/components/ui/input";
import { ReorderList } from "@/components/ui/reorder-list";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { useToast } from "@/components/ui/toast";
import { PERMISSION_COLUMN, PERMISSION_LIST } from "@/lib/permissions";
import { BLOCKS } from "@/lib/constants";
import type { AppRole, EditableMenuBlock, Permission, Profile, RoleCategory } from "@/types";

async function refreshRoleCatalog() {
  try {
    const response = await fetch("/api/roles/refresh", { method: "POST" });
    return response.ok;
  } catch { return false; }
}

const ROLE_COLORS = ["#007aff", "#34c759", "#ff9500", "#ff3b30", "#af52de", "#5ac8fa", "#8e8e93", "#5856d6"];
const ADMINISTRATIVE_PERMISSIONS: Permission[] = ["manage_system", "manage_members", "moderate_comments", "manage_ob_meet"];
const MENU_BLOCKS: EditableMenuBlock[] = ["short", "middle_long"];
const PERMISSION_GROUPS = [
  { label: "管理", keys: ADMINISTRATIVE_PERMISSIONS },
  { label: "日々の活動", keys: ["create_schedule", "create_menu", "decide_practice", "create_notice"] as Permission[] },
];

export function RoleManager({ roles: initialRoles, members, categories: initialCategories, canManageSystem }: { roles: AppRole[]; members: Profile[]; categories: RoleCategory[]; canManageSystem: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [roles, setRoles] = useState(initialRoles);
  const [memberState, setMemberState] = useState(members);
  const [categories, setCategories] = useState(initialCategories);
  const [creating, setCreating] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);

  async function reorder(next: AppRole[]) {
    const previous = roles;
    setRoles(next);
    const { error } = await createClient().rpc("reorder_roles", { role_ids: next.map((role) => role.id) });
    if (error) { setRoles(previous); showToast("並び順を更新できませんでした"); }
    else if (!(await refreshRoleCatalog())) showToast("並び順は保存しました。画面の更新に時間がかかる場合があります");
  }

  function renderRole(role: AppRole) {
    return <RoleRow key={role.id} role={role} members={memberState} categories={categories} canManageSystem={canManageSystem} onMembersUpdated={setMemberState} onError={showToast} onUpdated={(updated) => { setRoles((items) => items.map((item) => item.id === updated.id ? updated : item)); router.refresh(); }} onDeleted={() => { setRoles((items) => items.filter((item) => item.id !== role.id)); router.refresh(); }} />;
  }

  const everyone = roles.filter((role) => role.is_everyone);
  const uncategorized = roles.filter((role) => !role.is_everyone && !role.category?.trim());
  const folders = categories.map((category) => ({ category, roles: roles.filter((role) => !role.is_everyone && role.category === category.name) }));
  const knownCategories = new Set(categories.map((category) => category.name));
  for (const role of roles) {
    const name = role.category?.trim();
    if (!role.is_everyone && name && !knownCategories.has(name)) {
      folders.push({ category: { id: name, name, sort_order: 9999, created_at: role.created_at }, roles: roles.filter((item) => item.category === name) });
      knownCategories.add(name);
    }
  }

  return <div className="space-y-3">
    <p className="text-caption">部員に複数のロールを付けると、それぞれで許可された操作をまとめて使えます。名前を変更しても権限は変わりません。「全員」ロールの権限は全員に自動で適用されます。</p>
    <div data-ui-group className="flex justify-end gap-2">
      <Button type="button" size="sm" variant="outline" onClick={() => setCreatingCategory(true)}><FolderPlus size={16} />カテゴリを作成</Button>
      <Button type="button" size="sm" variant={reorderMode ? "primary" : "outline"} onClick={() => setReorderMode((value) => !value)}><SlidersHorizontal size={16} />{reorderMode ? "完了" : "並べ替え"}</Button>
    </div>

    {reorderMode ? <ReorderList items={roles} enabled onReorder={(next) => void reorder(next)} renderItem={renderRole} /> : <div className="space-y-3">
      {everyone.map(renderRole)}
      {folders.map((folder) => <details data-ui-section key={folder.category.id} className="group overflow-hidden rounded-xl border border-separator bg-card">
        <summary data-ui-disclosure className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 active:bg-bg"><span className="flex-1 text-sm font-semibold">{folder.category.name}</span><span className="text-xs tabular-nums text-muted">{folder.roles.length}件</span><ChevronDown size={18} className="text-muted transition-transform group-open:rotate-180" /></summary>
        <div className="space-y-2 border-t border-separator bg-bg/40 p-2">{folder.roles.length ? folder.roles.map(renderRole) : <p className="px-2 py-3 text-xs text-muted">このカテゴリのロールはまだありません</p>}</div>
      </details>)}
      {uncategorized.length > 0 && <section className="space-y-2"><p className="section-label">カテゴリなし</p>{uncategorized.map(renderRole)}</section>}
    </div>}

    <button data-ui-action data-ui-tone="primary" type="button" onClick={() => setCreating(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-separator py-3 text-[14px] font-semibold text-accent active:bg-bg"><Plus size={18} />新しいロールを作成</button>
    {creating && <RoleEditor open onClose={() => setCreating(false)} sortOrder={roles.length + 1} categories={categories} canManageSystem={canManageSystem} onSaved={(role) => { setRoles((items) => [...items, role]); setCreating(false); }} />}
    {creatingCategory && <CategoryEditor open sortOrder={categories.length + 1} onClose={() => setCreatingCategory(false)} onSaved={(category) => { setCategories((items) => [...items, category]); setCreatingCategory(false); }} />}
  </div>;
}

function RoleRow({ role, members, categories, onUpdated, onDeleted, onMembersUpdated, onError, canManageSystem }: { role: AppRole; members: Profile[]; categories: RoleCategory[]; onUpdated: (role: AppRole) => void; onDeleted: () => void; onMembersUpdated: (members: Profile[]) => void; onError: (message: string) => void; canManageSystem: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const perms = PERMISSION_LIST.filter((permission) => role[PERMISSION_COLUMN[permission.key]]);
  const editableBlocks = role.editable_menu_blocks ?? [];
  const assignedIds = role.is_everyone ? members.map((member) => member.id) : members.filter((member) => member.roles.some((item) => item.id === role.id)).map((member) => member.id);

  async function updateRoleMembers(nextMemberIds: string[]) {
    if (role.is_everyone) return;
    const previous = members;
    const selected = new Set(nextMemberIds);
    const optimistic = members.map((member) => ({ ...member, roles: selected.has(member.id) ? member.roles.some((item) => item.id === role.id) ? member.roles : [...member.roles, role] : member.roles.filter((item) => item.id !== role.id) }));
    onMembersUpdated(optimistic);
    const { error } = await createClient().rpc("set_role_members", { target_role_id: role.id, target_profile_ids: nextMemberIds });
    if (error) { onMembersUpdated(previous); onError("ロールのメンバーを更新できませんでした"); }
    else router.refresh();
  }

  async function remove() {
    const { data, error } = await createClient().rpc("delete_custom_role", { target_role_id: role.id });
    if (error || !data) { onError("ロールを削除できませんでした"); return false; }
    if (!(await refreshRoleCatalog())) onError("削除しました。画面の更新に時間がかかる場合があります");
    onDeleted(); return true;
  }

  return <Card className="p-3">
    <div className="flex items-start gap-2"><div className="min-w-0 flex-1 pt-1">
      <span className="flex items-center gap-1 text-[15px] font-semibold"><span className="inline-flex rounded-full px-2 py-0.5 text-[13px]" style={{ color: role.color, backgroundColor: `${role.color}18` }}>{role.name}</span>{role.is_system && <span className="inline-flex shrink-0 items-center gap-0.5 text-micro text-muted"><Lock size={10} />組み込み</span>}{role.is_everyone && <span className="inline-flex shrink-0 items-center gap-0.5 text-micro text-muted"><Users size={10} />全員に自動適用</span>}</span>
      <div className="mt-1.5 flex flex-wrap gap-1">{perms.length === 0 && editableBlocks.length === 0 ? <span className="text-micro">権限なし（肩書きのみ）</span> : perms.map((permission) => <span key={permission.key} className="rounded-full bg-accent/10 px-2 py-0.5 text-micro text-accent">{permission.label}</span>)}</div>
      {editableBlocks.length > 0 && <p className="mt-2 text-caption">他人のメニューを編集する範囲: {editableBlocks.map(block => BLOCKS[block].label).join("・")}（メニュー作成・編集の権限と組み合わせて適用）</p>}
    </div><ActionMenu onEdit={() => setEditing(true)} onDelete={role.is_system || role.is_everyone || (role.can_manage_system && !canManageSystem) ? undefined : remove} deleteTitle={`ロール「${role.name}」を削除しますか？`} deleteDescription="このロールの部員への割り当ても解除されます。" triggerLabel={`${role.name}のメニュー`} /></div>
    {editing && <RoleEditor open onClose={() => setEditing(false)} role={role} sortOrder={role.sort_order} categories={categories} canManageSystem={canManageSystem} onSaved={(updated) => { onUpdated(updated); setEditing(false); }} />}
    <div className="mt-3">{role.is_everyone ? <div className="flex min-h-11 items-center gap-2 rounded-xl border border-separator bg-bg px-3 text-sm font-semibold"><Users size={17} className="text-accent" /><span className="flex-1">すべての部員</span><span className="text-muted">{members.length}人</span></div> : role.can_manage_system && !canManageSystem ? <p className="text-caption">このロールの所属変更はシステム管理者のみ操作できます。</p> : <PersonPicker people={members} value={assignedIds} onChange={(ids) => void updateRoleMembers(ids)} label={`所属メンバー（${assignedIds.length}人）`} />}</div>
  </Card>;
}

type RoleSavePayload = Pick<AppRole, "name" | "can_manage_system" | "can_manage_members" | "can_moderate_comments" | "can_manage_ob_meet" | "editable_menu_blocks" | "can_create_schedule" | "can_create_menu" | "can_create_notice" | "can_decide_practice" | "color" | "category" | "sort_order">;

function roleSaveMatches(saved: AppRole, payload: RoleSavePayload): boolean {
  return Object.entries(payload).every(([key, value]) => key === "editable_menu_blocks"
    ? Array.isArray(saved.editable_menu_blocks) && new Set(saved.editable_menu_blocks).size === new Set(payload.editable_menu_blocks).size && payload.editable_menu_blocks.every(block => saved.editable_menu_blocks.includes(block))
    : saved[key as keyof RoleSavePayload] === value);
}

function RoleEditor({ open, onClose, onSaved, sortOrder, role, categories, canManageSystem }: { open: boolean; onClose: () => void; onSaved: (role: AppRole) => void; sortOrder: number; role?: AppRole; categories: RoleCategory[]; canManageSystem: boolean }) {
  const { showToast } = useToast();
  const [roleId] = useState(() => role?.id ?? crypto.randomUUID());
  const [name, setName] = useState(role?.name ?? "");
  const [flags, setFlags] = useState<Record<Permission, boolean>>({ manage_system: role?.can_manage_system ?? false, manage_members: role?.can_manage_members ?? false, moderate_comments: role?.can_moderate_comments ?? false, manage_ob_meet: role?.can_manage_ob_meet ?? false, create_schedule: role?.can_create_schedule ?? false, create_menu: role?.can_create_menu ?? false, create_notice: role?.can_create_notice ?? false, decide_practice: role?.can_decide_practice ?? false });
  const [editableBlocks, setEditableBlocks] = useState<EditableMenuBlock[]>(role?.editable_menu_blocks ?? []);
  const [color, setColor] = useState(role?.color ?? ROLE_COLORS[0]);
  const [category, setCategory] = useState(role?.category ?? "");
  const [saving, setSaving] = useState(false);
  const [pendingSave, setPendingSave] = useState<{ payload: RoleSavePayload; notSaved: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = JSON.stringify([name, flags, editableBlocks, color, category]);
  const [initialDraft] = useState(draft);

  async function savedRole(data: AppRole, differs = false) {
    const refreshed = await refreshRoleCatalog();
    if (differs) showToast("保存結果が入力と異なります。現在の設定を一覧に反映しました。内容を確認してください。");
    else if (!refreshed) showToast("保存しました。画面の更新に時間がかかる場合があります");
    onSaved(data);
  }

  async function checkSave() {
    if (saving || !pendingSave) return;
    const attempt = pendingSave.payload;
    setSaving(true); setPendingSave({ payload: attempt, notSaved: false });
    try {
      const { data, error: readError } = await createClient().from("roles").select("*").eq("id", roleId).maybeSingle();
      if (readError) { setError("保存結果を取得できませんでした。入力は残っています。接続後にもう一度確認してください。"); return; }
      if (!data) {
        setPendingSave({ payload: attempt, notSaved: true });
        setError(role ? "保存先のロールが見つかりません。入力は残っています。画面を更新して現在のロールを確認してください。" : "未保存を確認しました。同じ内容を再保存できます。");
        return;
      }
      const current = data as AppRole;
      if (current.id !== roleId) { setError("保存結果のロールを照合できませんでした。入力は残っています。もう一度結果を確認してください。"); return; }
      await savedRole(current, !roleSaveMatches(current, attempt));
    } catch {
      setError("保存結果を取得できませんでした。入力は残っています。接続後にもう一度確認してください。");
    } finally { setSaving(false); }
  }

  async function save() {
    if (saving || (pendingSave && (!pendingSave.notSaved || role))) return;
    if (!name.trim()) { setError("ロール名を入力してください"); return; }
    const payload: RoleSavePayload = pendingSave?.payload ?? { name: name.trim(), can_manage_system: flags.manage_system, can_manage_members: flags.manage_members, can_moderate_comments: flags.moderate_comments, can_manage_ob_meet: flags.manage_ob_meet, editable_menu_blocks: [...editableBlocks], can_create_schedule: flags.create_schedule, can_create_menu: flags.create_menu, can_create_notice: flags.create_notice, can_decide_practice: flags.decide_practice, color, category: role?.is_everyone ? null : category || null, sort_order: sortOrder };
    const unknown = () => {
      setPendingSave({ payload, notSaved: false });
      setError("保存結果を確認できませんでした。入力は残っています。先に保存結果を確認してください。");
    };
    setSaving(true); setError(null);
    try {
      const query = role ? createClient().from("roles").update(payload).eq("id", roleId) : createClient().from("roles").insert({ ...payload, id: roleId });
      const { data, error: saveError, status } = await query.select("*").single();
      if (saveError || !data) {
        if (saveError && status >= 400 && status < 500 && status !== 408 && !(saveError.code === "23505" && !role)) {
          setPendingSave(null); setError("保存できませんでした。入力と権限を確認してください。");
        } else unknown();
        return;
      }
      const current = data as AppRole;
      if (current.id !== roleId || !roleSaveMatches(current, payload)) { unknown(); return; }
      await savedRole(current);
    } catch {
      unknown();
    } finally { setSaving(false); }
  }

  return <FormModal open={open} onOpenChange={(next) => !next && onClose()} title={role ? "ロールを編集" : "ロールを作成"}><fieldset disabled={saving || !!pendingSave} className="min-w-0 space-y-4 pb-4">
    <FormDraftGuard dirty={draft !== initialDraft || !!pendingSave} busy={saving || (!!pendingSave && !pendingSave.notSaved)} onSave={save} />
    <div><p className="section-label mb-1.5">ロール名</p><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例: 会計担当 / 主将" maxLength={20} /></div>
    <p className="text-caption">名前は肩書きの表示に使います。許可する操作は下の設定で決まります。</p>
    {!role?.is_everyone && <div><p className="section-label mb-1.5">カテゴリ</p><Select value={category || "__none__"} onValueChange={(value) => setCategory(value === "__none__" ? "" : value)} ariaLabel="ロールカテゴリ" options={[{ value: "__none__", label: "カテゴリなし" }, ...categories.map((item) => ({ value: item.name, label: item.name }))]} /></div>}
    {PERMISSION_GROUPS.map(group => <div key={group.label}><p className="section-label mb-1.5">{group.label}</p><div className="space-y-2">{group.keys.map(key => {
      const permission = PERMISSION_LIST.find(item => item.key === key)!;
      const administrativeForEveryone = role?.is_everyone && ADMINISTRATIVE_PERMISSIONS.includes(key);
      const disabled = administrativeForEveryone || (key === "manage_system" && !canManageSystem);
      return <div key={key}><Toggle checked={flags[key]} onChange={() => setFlags(current => ({ ...current, [key]: !current[key] }))} label={permission.label} description={administrativeForEveryone ? "全員に管理権限が付くため、「全員」ロールには設定できません。" : key === "manage_system" && !canManageSystem ? `${permission.desc}（システム管理者のみ変更可）` : permission.desc} disabled={disabled} />
        {key === "create_menu" && <div className="mt-2 space-y-2 rounded-xl border border-separator p-3"><p className="section-label">他人のメニューを編集するブロック</p><p className="text-caption">メニュー作成・編集の権限と組み合わせて適用します。ほかのロールからの権限も使えます。他人のメニューの削除には部員・ロール管理が必要です。</p>{MENU_BLOCKS.map(block => <Toggle key={block} label={BLOCKS[block].label} checked={editableBlocks.includes(block)} onChange={() => setEditableBlocks(current => current.includes(block) ? current.filter(item => item !== block) : [...current, block])} disabled={role?.is_everyone} description={role?.is_everyone ? "「全員」ロールには設定できません。" : undefined} />)}</div>}
      </div>;
    })}</div></div>)}
    <div><p className="section-label mb-1.5">ロールの色</p><div data-ui-swatches className="grid grid-cols-8 gap-2">{ROLE_COLORS.map((option) => <button data-ui-choice key={option} type="button" onClick={() => setColor(option)} aria-pressed={color === option} aria-label={`色 ${option}`} className="flex aspect-square items-center justify-center rounded-lg border" style={{ borderColor: color === option ? option : "#e5e5ea", backgroundColor: `${option}18` }}><span className="h-5 w-5 rounded-full" style={{ backgroundColor: option }} /></button>)}</div></div>
  </fieldset>{error && <p className="text-center text-caption text-danger">{error}</p>}<FormModalFooter><Button size="lg" onClick={save} disabled={saving || (!!pendingSave && (!pendingSave.notSaved || !!role))}>{saving ? "確認・保存中…" : pendingSave?.notSaved && !role ? "同じ内容を再保存" : role ? "保存する" : "作成する"}</Button>{pendingSave && <Button variant="outline" onClick={checkSave} disabled={saving}>保存結果を確認</Button>}</FormModalFooter></FormModal>;
}

function CategoryEditor({ open, onClose, onSaved, sortOrder }: { open: boolean; onClose: () => void; onSaved: (category: RoleCategory) => void; sortOrder: number }) {
  const [name, setName] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  async function save() {
    if (saving) return;
    if (!name.trim()) { setError("カテゴリ名を入力してください"); return; }
    setSaving(true); setError("");
    try {
      const { data, error: saveError } = await createClient().from("role_categories").insert({ name: name.trim(), sort_order: sortOrder }).select("*").single();
      if (saveError || !data) { setError("保存できませんでした。同じ名前のカテゴリがないか確認してください"); return; }
      onSaved(data as RoleCategory);
    } catch { setError("保存できませんでした。もう一度お試しください"); }
    finally { setSaving(false); }
  }
  return <FormModal open={open} onOpenChange={(next) => !next && onClose()} title="ロールカテゴリを作成"><fieldset disabled={saving} className="min-w-0 space-y-4 pb-4"><FormDraftGuard dirty={name !== ""} busy={saving} onSave={save} /><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="例: 運営 / 種目別" maxLength={20} />{error && <p className="text-caption text-danger">{error}</p>}<FormModalFooter><Button size="lg" onClick={save} disabled={saving || !name.trim()}>{saving ? "作成中…" : "作成する"}</Button></FormModalFooter></fieldset></FormModal>;
}
