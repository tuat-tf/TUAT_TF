"use client";

import { useEffect, useState } from "react";
import { NoteEditor } from "@/components/features/NoteEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshStatus } from "@/components/ui/refresh-status";
import { createClient } from "@/lib/supabase/client";
import type { AuthorMini, NoteScope } from "@/types";

export function NoteComposer({
  currentUser,
  isAdmin,
  initialScope = "shared",
  parentId,
  onDone,
}: {
  currentUser: AuthorMini;
  isAdmin: boolean;
  initialScope?: NoteScope;
  /** サブフォルダとして作成する場合の親フォルダID */
  parentId?: string;
  onDone: () => void;
}) {
  const [members, setMembers] = useState<AuthorMini[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const supabase = createClient();
    void Promise.resolve(supabase
      .from("profiles")
      .select("id, display_name, avatar_url, blocks, grade")
      .eq("status", "active")
      .order("display_name", { ascending: true }))
      .then((memberResult) => {
        if (!active) return;
        if (memberResult.error) { setFailed(true); return; }
        setMembers((memberResult.data ?? []) as AuthorMini[]);
      }).catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  if (!members) {
    if (failed) return <RefreshStatus failed busy={false} hasData={false} label="部員" retry={() => { setFailed(false); setAttempt((value) => value + 1); }} />;
    return (
      <div className="space-y-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <NoteEditor
      currentUser={currentUser}
      members={members}
      isAdmin={isAdmin}
      initialScope={initialScope}
      parentId={parentId}
      onDone={onDone}
    />
  );
}
