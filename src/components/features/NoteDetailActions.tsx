"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useShareActions } from "@/components/common/ShareButton";
import { ActionMenu } from "@/components/ui/action-menu";
import { NoteEditor } from "@/components/features/NoteEditor";
import { FormModal } from "@/components/ui/form-modal";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/toast";
import type { AuthorMini, NoteWithRelations } from "@/types";

export function NoteDetailActions({
  note,
  currentUser,
  members,
  isAdmin,
  canEdit,
  canDelete,
}: {
  note: NoteWithRelations;
  currentUser: AuthorMini;
  members: AuthorMini[];
  isAdmin: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const canShare = note.status === "published";
  const { copyLink, shareExternally } = useShareActions({
    title: note.title,
    text: `${note.title}｜ノート`,
    path: `/notes/${note.id}`,
  });

  async function remove() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from("notes").delete().eq("id", note.id).select("id");
      if (error || !data || data.length !== 1) {
        showToast("フォルダを削除できませんでした");
        return false;
      }
      router.push("/notes");
      router.refresh();
      return true;
    } catch {
      showToast("フォルダを削除できませんでした");
      return false;
    }
  }

  return (
    <>
      {(canShare || canEdit || canDelete) && (
        <ActionMenu
          onShare={canShare ? copyLink : undefined}
          shareLabel="リンクをコピー"
          onShareExternally={canShare ? shareExternally : undefined}
          onEdit={canEdit ? () => setEditing(true) : undefined}
          onDelete={canDelete ? remove : undefined}
          triggerLabel="フォルダの操作メニュー"
          className="h-11 w-11"
          deleteTitle="フォルダを削除しますか？"
          deleteDescription="フォルダ内のサブフォルダ・記事もすべて削除され、元に戻せません。"
        />
      )}
      {editing && (
        <FormModal
          open
          onOpenChange={setEditing}
          title="フォルダを編集"
        >
          <NoteEditor
            currentUser={currentUser}
            members={members}
            note={note}
            isAdmin={isAdmin}
            initialScope={note.scope}
            onDone={() => setEditing(false)}
          />
        </FormModal>
      )}
    </>
  );
}
