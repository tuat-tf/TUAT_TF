"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormModal, FormModalFooter, useFormDraft } from "@/components/ui/form-modal";
import { SegmentedControl } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { atomicSaveMessage } from "@/lib/atomic-save";
import { saveMenuEdit, type PendingMenuEdit } from "@/lib/menu-edit-save";
import { MENU_DRAFT_VISIBILITY_DESCRIPTION } from "@/lib/menu-copy";
import { PersonPicker } from "@/components/features/PersonPicker";
import { BLOCKS, EDITABLE_BLOCK_ORDER, normalizeBlock } from "@/lib/constants";
import type { AuthorMini, Block, PracticeMenu } from "@/types";

type MenuKind = "block" | "people";
type MenuStatus = "draft" | "published";
type MenuSaveResult = Pick<PracticeMenu, "id" | "schedule_id" | "content" | "target_block" | "status" | "pace" | "remark" | "supplement" | "targets">;

export function MenuEditModal({
  allowedBlocks,
  menu,
  scheduleId,
  open,
  onOpenChange,
  onSaved,
}: {
  menu: PracticeMenu;
  allowedBlocks?: Block[];
  scheduleId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (menu: PracticeMenu) => void;
}) {
  if (!open) return null;
  return (
    <FormModal open onOpenChange={onOpenChange} title="練習メニューを編集">
      <MenuEditor
        allowedBlocks={allowedBlocks}
        menu={menu}
        scheduleId={scheduleId}
        onDone={(saved) => { if (saved) onSaved?.({ ...menu, ...saved }); onOpenChange(false); }}
      />
    </FormModal>
  );
}

function MenuEditor({ allowedBlocks, scheduleId, menu, onDone }: {
  scheduleId: string;
  menu: PracticeMenu;
  allowedBlocks?: Block[];
  onDone: (saved: MenuSaveResult) => void;
}) {
  const initialTargetIds = menu.targets?.map(target => target.user_id) ?? [];
  const [members, setMembers] = useState<AuthorMini[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [readVersion, setReadVersion] = useState(0);
  const [kind, setKind] = useState<MenuKind>(initialTargetIds.length ? "people" : "block");
  const [targetBlock, setTargetBlock] = useState<Block>(menu.target_block ? normalizeBlock(menu.target_block) : "middle_long");
  const [targetIds, setTargetIds] = useState(initialTargetIds);
  const [content, setContent] = useState(menu.content ?? "");
  const [pace, setPace] = useState(menu.pace ?? "");
  const [remark, setRemark] = useState(menu.remark ?? "");
  const [supplement, setSupplement] = useState(menu.supplement ?? "");
  const [status, setStatus] = useState<MenuStatus>(menu.status);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<PendingMenuEdit | null>(null);
  const lock = useRef(false);
  const draft = JSON.stringify([content, pace, remark, supplement, status, targetBlock, kind, [...targetIds].sort()]);
  const [initialDraft] = useState(draft);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await createClient().from("profiles")
          .select("id, display_name, avatar_url, blocks, grade").eq("status", "active").order("display_name", { ascending: true });
        if (error || !data) throw new Error("Members unavailable");
        if (active) { setMembers(data as AuthorMini[]); setLoadError(false); }
      } catch { if (active) setLoadError(true); }
    })();
    return () => { active = false; };
  }, [readVersion]);

  async function submit() {
    if (lock.current) return;
    if (!attempt.current && ((!content.trim() && !(targetBlock === "middle_long" && (pace.trim() || remark.trim() || supplement.trim()))) || (kind === "people" && targetIds.length === 0))) {
      setError(kind === "people" && targetIds.length === 0 ? "対象者を1人以上選択してください" : "メニュー内容を入力してください");
      return;
    }
    lock.current = true;
    setSaving(true); setError(null);
    const current = attempt.current ?? {
      id: menu.id, scheduleId,
      values: { content: content.trim(), target_block: targetBlock, status,
        pace: targetBlock === "middle_long" ? pace.trim() || null : null,
        remark: targetBlock === "middle_long" || targetBlock === "short" ? remark.trim() || null : null,
        supplement: targetBlock === "middle_long" ? supplement.trim() || null : null },
      targetIds: kind === "people" ? [...targetIds] : [], uncertain: false, confirmed: false,
    };
    attempt.current = current;
    try {
      const result = await saveMenuEdit(createClient(), current);
      if (!result.ok) {
        setPending(result.reason === "unknown");
        if (result.reason !== "unknown") attempt.current = null;
        setError(result.reason === "invalid" ? "メニューの入力内容を確認してください。" : atomicSaveMessage(result.reason));
        return;
      }
      setPending(true);
      const targets = current.targetIds.map(id => ({ menu_id: current.id, user_id: id,
        profile: members?.find(member => member.id === id) ?? menu.targets?.find(target => target.user_id === id)?.profile }));
      onDone({ id: current.id, schedule_id: scheduleId, ...current.values, targets });
    } catch {
      setPending(true);
      setError(current.confirmed ? "保存しましたが、画面を更新できませんでした。もう一度押すと画面だけ更新します。" : "保存結果を確認できませんでした。もう一度押すと結果だけ確認します。");
    } finally { lock.current = false; setSaving(false); }
  }
  const loading = members === null;
  useFormDraft({ dirty: pending || draft !== initialDraft, busy: saving, onSave: submit, intent: pending ? "check" : "update" });
  return (
    <div className="min-w-0 space-y-5 pb-4">
      {loadError && <p className="text-caption text-danger">対象者を読み込めませんでした。<Button variant="ghost" size="sm" onClick={() => setReadVersion(value => value + 1)}>もう一度読み込む</Button></p>}
      <fieldset disabled={saving || pending} className="min-w-0 space-y-5">
      <div>
        <p className="section-label mb-1.5">メニューの種類</p>
        <SegmentedControl
          items={[
            { key: "block", label: "ブロック全体" },
            { key: "people", label: "個人を指定" },
          ]}
          value={kind}
          onChange={(key) => setKind(key as MenuKind)}
        />
      </div>

      {kind === "block" ? (
        <div>
          <p className="section-label mb-1.5">ブロック</p>
          <div className="grid grid-cols-2 gap-2">
            {EDITABLE_BLOCK_ORDER.filter(block => !allowedBlocks || allowedBlocks.includes(block)).map((block) => {
              const meta = BLOCKS[block];
              const active = targetBlock === block;
              return (
                <button data-ui-action
                  key={block}
                  type="button"
                  aria-pressed={active} onClick={() => setTargetBlock(block)}
                  className="h-11 rounded-xl border text-[14px] font-semibold"
                  style={{
                    borderColor: active ? meta.color : "#e5e5ea",
                    backgroundColor: active ? meta.bg : "#fff",
                    color: active ? meta.color : "#8e8e93",
                  }}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="section-label mb-1.5">ブロック</p>
            <p className="text-micro mb-1.5">同じブロックの部員もこの個別メニューを閲覧できます。</p>
            <div className="grid grid-cols-2 gap-2">
              {EDITABLE_BLOCK_ORDER.filter(block => !allowedBlocks || allowedBlocks.includes(block)).map((block) => {
                const meta = BLOCKS[block];
                const active = targetBlock === block;
                return (
                  <button data-ui-action
                    key={block}
                    type="button"
                    aria-pressed={active} onClick={() => setTargetBlock(block)}
                    className="h-11 rounded-xl border text-[14px] font-semibold"
                    style={{
                      borderColor: active ? meta.color : "#e5e5ea",
                      backgroundColor: active ? meta.bg : "#fff",
                      color: active ? meta.color : "#8e8e93",
                    }}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>
          <PersonPicker people={members ?? []} value={targetIds} onChange={setTargetIds} label="対象者" />
        </div>
      )}

      <div>
        <p className="section-label mb-1.5">メニュー</p>
        <Textarea autoGrow
          rows={8}
          placeholder={"例:\nW-up 2km\n本練習 1000m×5 (R3')\nD-down 2km"}
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>

      {targetBlock === "short" && (
        <div>
          <p className="section-label mb-1.5">説明</p>
          <Textarea autoGrow
            rows={5}
            placeholder="例: メニューの目的、走り方のポイント"
            value={remark}
            onChange={(event) => setRemark(event.target.value)}
          />
        </div>
      )}

      {targetBlock === "middle_long" && (
        <>
          <div>
            <p className="section-label mb-1.5">ペース</p>
            <Textarea autoGrow
              rows={3}
              placeholder={"例: 1000mを3'30〜3'40"}
              value={pace}
              onChange={(event) => setPace(event.target.value)}
            />
          </div>
          <div>
            <p className="section-label mb-1.5">補足</p>
            <Textarea autoGrow
              rows={3}
              placeholder={"例: 雨天時は室内メニューに変更"}
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
            />
          </div>
          <div>
            <p className="section-label mb-1.5">補強</p>
            <Textarea autoGrow
              rows={4}
              placeholder={"例: 体幹サーキット×3セット"}
              value={supplement}
              onChange={(event) => setSupplement(event.target.value)}
            />
          </div>
        </>
      )}

      <div>
        <p className="section-label mb-1.5">公開状態</p>
        <SegmentedControl
          items={[
            { key: "published", label: "公開" },
            { key: "draft", label: "下書き" },
          ]}
          value={status}
          onChange={(key) => setStatus(key as MenuStatus)}
        />
        <p className="text-micro mt-1.5">
          {MENU_DRAFT_VISIBILITY_DESCRIPTION}
        </p>
      </div>

      </fieldset>
      {error && <p className="text-center text-caption text-danger">{error}</p>}
      <FormModalFooter>
        <Button
          size="lg"
          onClick={submit}
          disabled={saving || loading}
        >
          {saving ? "確認・保存中…" : pending ? "保存結果を確認" : "更新する"}
        </Button>
      </FormModalFooter>

    </div>
  );
}
