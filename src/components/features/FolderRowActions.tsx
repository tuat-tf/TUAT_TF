"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionMenu } from "@/components/ui/action-menu";
import { FormModal } from "@/components/ui/form-modal";
import { NoteEditor } from "@/components/features/NoteEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshStatus } from "@/components/ui/refresh-status";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { safeDelete, safeUpdate } from "@/lib/safe-update";
import type { AuthorMini, NoteWithRelations } from "@/types";

/**
 * フォルダ一覧の行に付く⋯メニュー（編集/削除）。
 * 記事行（NoteArticleActions）と同じ導線をフォルダにも用意する
 * （2026-07-13 オーナー指摘「編集をどこでやればいいかわからない」対応。
 * フォルダを開いた先の右上⋯も従来どおり使える）。
 */
export function FolderRowActions({
  note,
  currentUser,
  isAdmin,
}: {
  note: NoteWithRelations;
  currentUser: AuthorMini;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [members, setMembers] = useState<AuthorMini[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!editing || members) return;
    let active = true;
    void Promise.resolve(createClient()
      .from("profiles")
      .select("id, display_name, avatar_url, blocks, grade")
      .eq("status", "active")
      .order("display_name", { ascending: true }))
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setFailed(true); return; }
        setMembers((data ?? []) as AuthorMini[]);
      }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [editing, members, attempt]);

  async function remove() {
    const result = await safeDelete(createClient(), "notes", { id: note.id });
    if (!result.ok) {
      showToast("フォルダを削除できませんでした");
      return false;
    }
    router.refresh();
    return true;
  }
  async function togglePin() {
    const result = await safeUpdate(createClient(), "notes", { pinned: !note.pinned }, { id: note.id })
      .catch(() => ({ ok: false } as const));
    if (!result.ok) {
      showToast("\u30d4\u30f3\u7559\u3081\u3092\u5909\u66f4\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f");
      return;
    }
    router.refresh();
  }

  return (
    <>
      <ActionMenu
        onEdit={() => { setFailed(false); setEditing(true); }}
        onDelete={remove}
        onPin={togglePin}
        pinned={note.pinned}
        deleteTitle="フォルダを削除しますか？"
        deleteDescription="フォルダ内のサブフォルダ・記事もすべて削除され、元に戻せません。"
      />
      {editing && (
        <FormModal open onOpenChange={setEditing} title="フォルダを編集">
          {members ? (
            <NoteEditor
              currentUser={currentUser}
              members={members}
              note={note}
              isAdmin={isAdmin}
              initialScope={note.scope}
              onDone={() => setEditing(false)}
            />
          ) : failed ? (
            <RefreshStatus failed busy={false} hasData={false} label="部員" retry={() => { setFailed(false); setAttempt((value) => value + 1); }} />
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}
        </FormModal>
      )}
    </>
  );
}
