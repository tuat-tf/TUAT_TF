"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Folder, Pin } from "lucide-react";
import { searchNoteArticles, type NoteArticleSearchResult } from "@/app/(app)/notes/actions";
import { folderContentsLabel } from "@/lib/note-contents";
import { Avatar } from "@/components/common/Avatar";
import { FolderRowActions } from "@/components/features/FolderRowActions";
import { ThreadList } from "@/components/features/ThreadList";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import type {
  AuthorMini,
  NoteScope,
  NoteWithRelations,
  ThreadWithAuthor,
} from "@/types";

export type NotesTab = NoteScope | "threads";

/** 共有/個人タブの選択を保持するcookie（タイムラインの簡易表示cookieと同じ方式でSSR復元） */
const SCOPE_COOKIE = "tuat-notes-scope";

export function NotesView({
  currentUser,
  notes,
  threads = [],
  isAdmin = false,
  canViewAllFolders = false,
  mine = false,
  initialScope = "shared",
}: {
  currentUser: AuthorMini;
  notes: NoteWithRelations[];
  threads?: ThreadWithAuthor[];
  isAdmin?: boolean;
  canViewAllFolders?: boolean;
  mine?: boolean;
  initialScope?: NotesTab;
}) {
  const [scope, setScope] = useState<NotesTab>(initialScope);
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [searchResult, setSearchResult] = useState<{
    query: string;
    attempt: number;
    articles: NoteArticleSearchResult[];
    failed: boolean;
  } | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("ja");
  const searching = !!normalizedQuery && (searchResult?.query !== normalizedQuery || searchResult.attempt !== searchAttempt);
  const searchError = !searching && searchResult?.failed === true;

  function changeQuery(next: string) {
    setQuery(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("q", next);
    else url.searchParams.delete("q");
    // Next's native history integration keeps this entry for detail -> back,
    // without refetching the route or adding one history entry per keystroke.
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function changeScope(next: NotesTab) {
    setScope(next);
    // ノート詳細から戻ってページが再レンダーされても選択タブが残るようにする
    document.cookie = `${SCOPE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }
  const visibleNotes = useMemo(
    () =>
      notes.filter((note) => {
        if (note.parent_id) return false; // サブフォルダは親フォルダ内でのみ表示
        if (mine && note.author_id !== currentUser.id) return false;
        if (note.scope !== scope) return false;
        if (!mine && !canViewAllFolders && note.author_id !== currentUser.id && note.status !== "published") return false;
        return true;
      }).sort((a, b) => Number(b.pinned) - Number(a.pinned)),
    [canViewAllFolders, currentUser.id, mine, notes, scope],
  );

  const matchingFolders = useMemo(() => {
    if (!normalizedQuery) return [];
    return notes.filter((note) => {
      if (mine && note.author_id !== currentUser.id) return false;
      if (note.scope !== scope) return false;
      if (!mine && !canViewAllFolders && note.author_id !== currentUser.id && note.status !== "published") return false;
      return `${note.title}\n${note.description ?? ""}`
        .toLocaleLowerCase("ja")
        .includes(normalizedQuery);
    });
  }, [canViewAllFolders, currentUser.id, mine, normalizedQuery, notes, scope]);

  const matchingArticles = useMemo(
    () =>
      (searching || searchError ? [] : searchResult?.articles ?? []).filter((article) => {
        const note = article.note;
        if (!note || note.scope !== scope) return false;
        if (mine && note.author_id !== currentUser.id) return false;
        if (!mine && !canViewAllFolders && note.author_id !== currentUser.id && note.status !== "published") return false;
        return true;
      }),
    [searching, searchError, searchResult, canViewAllFolders, currentUser.id, mine, scope],
  );

  useEffect(() => {
    if (!normalizedQuery) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchNoteArticles(normalizedQuery);
        if (!cancelled) setSearchResult({ query: normalizedQuery, attempt: searchAttempt, articles: results, failed: false });
      } catch {
        if (!cancelled) setSearchResult({ query: normalizedQuery, attempt: searchAttempt, articles: [], failed: true });
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [normalizedQuery, searchAttempt]);

  return (
    <div className="space-y-4 px-4 pt-1 md:px-6 lg:space-y-3">
      <div className="flex min-h-9 items-center lg:min-h-8">
        <SegmentedControl
          items={[
            { key: "shared", label: "共有" },
            { key: "personal", label: "個人作成" },
            { key: "threads", label: "スレッド" },
          ].filter(({ key }) => key !== "threads")}
          value={scope}
          onChange={(key) => changeScope(key as NotesTab)}
          className="w-full md:max-w-[360px]"
        />
      </div>
      <Input
        type="search"
        value={query}
        onChange={(event) => changeQuery(event.target.value)}
        placeholder="検索"
        aria-label="ノートと記事を検索"
      />


      {normalizedQuery ? (
        <NoteSearchResults
          folders={matchingFolders}
          articles={matchingArticles}
          currentUser={currentUser}
          isAdmin={isAdmin}
          mine={mine}
          searching={searching}
          error={searchError}
          retry={() => setSearchAttempt((attempt) => attempt + 1)}
        />
      ) : scope === "threads" ? (
        <ThreadList threads={threads} currentUserId={currentUser.id} isAdmin={isAdmin} />
      ) : (
        <NoteList
          notes={visibleNotes}
          currentUser={currentUser}
          isAdmin={isAdmin}
          showAuthor={!mine}
        />
      )}
    </div>
  );
}

export function NoteList({
  notes,
  currentUser,
  isAdmin = false,
  showAuthor = false,
}: {
  notes: NoteWithRelations[];
  currentUser: AuthorMini;
  isAdmin?: boolean;
  showAuthor?: boolean;
}) {
  const currentUserId = currentUser.id;
  if (notes.length === 0) {
    return (
      <EmptyState
        title="まだフォルダはありません"
        description="フォルダを作成すると、その中へ記事を追加できます。"
      />
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2 md:gap-3">
      {[...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned)).map((note) => (
        <Link data-ui-row key={note.id} href={`/notes/${note.id}`} prefetch={false}>
          <Card className="p-4 active:bg-bg">
            <div className="flex items-start gap-3">
              <Folder size={20} className="mt-0.5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate text-headline">{note.title}</p>
                  {note.status === "draft" && <Badge>下書き</Badge>}
                </div>
                  {note.pinned && <Pin size={14} className="shrink-0 fill-accent text-accent" aria-label="ピン留め" />}
                <p className="mt-1 text-caption">{folderContentsLabel(note)}</p>
                {note.description && (
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-caption">
                    {note.description}
                  </p>
                )}
                {showAuthor && (
                  <div className="mt-2 flex items-center gap-2">
                    <Avatar
                      name={note.author.display_name}
                      avatarUrl={note.author.avatar_url}
                      blocks={note.author.blocks}
                      size="sm"
                    />
                    <span className="text-micro">
                      {note.author.id === currentUserId
                        ? "自分"
                        : note.author.display_name}
                    </span>
                  </div>
                )}
              </div>
              {note.author_id === currentUserId || isAdmin ? (
                <div
                  className="-mr-2 -mt-1 shrink-0"
                  onClick={(event) => {
                    // 行全体がLinkのため、メニュー操作でフォルダへ遷移しない
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                >
                  <FolderRowActions note={note} currentUser={currentUser} isAdmin={isAdmin} />
                </div>
              ) : (
                <ChevronRight size={18} className="mt-0.5 shrink-0 text-muted" />
              )}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function NoteSearchResults({
  folders,
  articles,
  currentUser,
  isAdmin,
  mine,
  searching,
  error,
  retry,
}: {
  folders: NoteWithRelations[];
  articles: NoteArticleSearchResult[];
  currentUser: AuthorMini;
  isAdmin: boolean;
  mine: boolean;
  searching: boolean;
  error: boolean;
  retry: () => void;
}) {
  if (error) {
    return <EmptyState title="検索できませんでした" description="通信状態を確認してから、もう一度お試しください。" action={<Button variant="secondary" onClick={retry}>再試行</Button>} />;
  }
  if (searching && folders.length === 0 && articles.length === 0) {
    return <p role="status" className="py-8 text-center text-caption">検索中…</p>;
  }
  if (folders.length === 0 && articles.length === 0) {
    return <EmptyState title="条件に合うノート・記事はありません" description="条件を変えてみてください。" />;
  }
  return (
    <div className="space-y-5">
      {searching && <p role="status" className="text-caption">検索中…</p>}
      {folders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-caption font-semibold">{"\u30ce\u30fc\u30c8"}</h2>
          <NoteList
            notes={folders}
            currentUser={currentUser}
            isAdmin={isAdmin}
            showAuthor={!mine}
          />
        </section>
      )}
      {articles.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-caption font-semibold">{"\u8a18\u4e8b"}</h2>
          <div className="space-y-2">
            {articles.map((article) => (
              <Link data-ui-row key={article.id} href={`/notes/${article.note_id}/articles/${article.id}`} prefetch={false}>
                <Card className="p-4 active:bg-bg">
                  <p className="text-headline">{article.title}</p>
                  <p className="mt-1 text-caption">{article.note?.title}</p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
