"use client";

import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { ChevronDown, FileText, Pin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { NoteArticleActions } from "@/components/features/NoteArticleActions";
import { NoteBody } from "@/components/features/NoteBody";
import { truncateNoteBody } from "@/lib/note-body";
import { NotePoll } from "@/components/features/NotePoll";
import { cn } from "@/lib/utils";
import type { AuthorMini, NoteArticleWithAuthor } from "@/types";

/** 本文がこの長さを超えたら一覧では省略し「全文を表示」で記事詳細へ誘導する */
const LONG_BODY = 600;

/**
 * ノートフォルダ内の記事一覧。記事カードをタップすると、その場で本文を展開する
 * （別ページに飛ばない）。公開記事の共有と、権限がある場合の管理操作を単一の ⋯ にまとめる。
 */
export function NoteArticleList({
  noteId,
  articles,
  canShare = true,
  canEdit = false,
  currentUser,
}: {
  noteId: string;
  articles: NoteArticleWithAuthor[];
  canShare?: boolean;
  canEdit?: boolean;
  currentUser: AuthorMini;
}) {
  // 1件のみ展開（初期は全件閉じる）
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      {[...articles].sort((a, b) => Number(b.pinned) - Number(a.pinned)).map((article) => {
        const open = openId === article.id;
        const isLong = article.body.length > LONG_BODY;
        return (
          <Card key={article.id} className="p-4">
            <div className="flex items-start gap-2">
              <button
                data-ui-disclosure
                type="button"
                onClick={() => setOpenId(open ? null : article.id)}
                aria-expanded={open}
                aria-controls={`note-article-body-${article.id}`}
                className="flex min-h-11 min-w-0 flex-1 items-start gap-3 text-left"
              >
                <FileText size={19} className="mt-0.5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-headline" title={article.title}>{article.title}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1 text-caption">
                    {article.author.display_name}・
                    {format(new Date(article.updated_at), "M月d日更新", { locale: ja })}
                    {article.pinned && <Pin size={14} className="shrink-0 fill-accent text-accent" aria-label="ピン留め" />}
                  </p>
                </div>
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 shrink-0 text-muted transition-transform motion-reduce:transition-none",
                    open && "rotate-180",
                  )}
                />
              </button>
              {(canEdit || canShare) && (
                <div className="shrink-0">
                  <NoteArticleActions
                    noteId={noteId}
                    canEdit={canEdit}
                    canShare={canShare}
                    article={article}
                    currentUser={currentUser}
                  />
                </div>
              )}
            </div>

            <div id={`note-article-body-${article.id}`} hidden={!open} className="mt-3 border-t border-separator pt-3">
              {open && (
                <>
                  {/* 写真は本文で置いた位置に出る。長い記事は途中までにして詳細へ誘導する。 */}
                  <NoteBody
                    body={isLong ? truncateNoteBody(article.body, LONG_BODY) + "…" : article.body}
                    images={article.images}
                    className="text-[14px]"
                  />
                  {article.pollOptions && article.pollOptions.length > 0 && (
                    <div className="mt-3">
                      <NotePoll
                        articleId={article.id}
                        userId={currentUser.id}
                        userName={currentUser.display_name}
                        userAvatarUrl={currentUser.avatar_url}
                        userBlocks={currentUser.blocks}
                        userGrade={currentUser.grade}
                        options={article.pollOptions}
                        multiple={article.poll_multiple}
                        anonymous={article.poll_anonymous}
                        allowOptions={article.poll_allow_options}
                      />
                    </div>
                  )}
                  <Link
                    data-ui-action="text"
                    href={`/notes/${noteId}/articles/${article.id}`}
                    prefetch={false}
                    className="mt-2 inline-block text-[13px] font-medium text-accent pressable"
                  >
                    {isLong ? "全文を表示" : "記事を開く"}
                  </Link>
                </>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
