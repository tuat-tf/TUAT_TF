"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useShareActions } from "@/components/common/ShareButton";
import { NoteArticleEditor } from "@/components/features/NoteArticleEditor";
import { ActionMenu } from "@/components/ui/action-menu";
import { FormModal } from "@/components/ui/form-modal";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { safeUpdate } from "@/lib/safe-update";
import type { AuthorMini, NoteArticleWithAuthor } from "@/types";

export function NoteArticleActions({
  noteId,
  article,
  currentUser,
  canEdit = true,
  canShare = true,
}: {
  noteId: string;
  article: NoteArticleWithAuthor;
  currentUser: AuthorMini;
  canEdit?: boolean;
  canShare?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const { copyLink, shareExternally } = useShareActions({
    title: article.title,
    text: `${article.title}｜ノートの記事`,
    path: `/notes/${noteId}/articles/${article.id}`,
  });

  async function remove() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("note_articles")
        .delete()
        .eq("id", article.id)
        .eq("note_id", noteId)
        .select("id");
      if (error || !data || data.length !== 1) {
        showToast("記事を削除できませんでした");
        return false;
      }
      router.push(`/notes/${noteId}`);
      router.refresh();
      return true;
    } catch {
      showToast("記事を削除できませんでした");
      return false;
    }
  }

  async function togglePin() {
    const result = await safeUpdate(createClient(), "note_articles", { pinned: !article.pinned }, { id: article.id, note_id: noteId });
    if (!result.ok) {
      showToast("\u30d4\u30f3\u7559\u3081\u3092\u5909\u66f4\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f");
      return;
    }
    router.refresh();
  }

  return (
    <>
      {(canShare || canEdit) && (
        <ActionMenu
          onShare={canShare ? copyLink : undefined}
          shareLabel="リンクをコピー"
          onShareExternally={canShare ? shareExternally : undefined}
          onEdit={canEdit ? () => setEditing(true) : undefined}
          onPin={canEdit ? togglePin : undefined}
          pinned={article.pinned}
          onDelete={canEdit ? remove : undefined}
          triggerLabel="記事の操作メニュー"
          className="h-11 w-11"
          deleteTitle="記事を削除しますか？"
          deleteDescription="削除した記事は元に戻せません。"
        />
      )}
      {editing && (
        <FormModal open onOpenChange={setEditing} title="記事を編集">
          <NoteArticleEditor
            noteId={noteId}
            currentUser={currentUser}
            article={article}
            onDone={() => setEditing(false)}
          />
        </FormModal>
      )}
    </>
  );
}
