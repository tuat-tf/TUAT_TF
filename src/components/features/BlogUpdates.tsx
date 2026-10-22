"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Rss } from "lucide-react";
import { NavigationLink } from "@/components/ui/navigation-list";
import { blogHasUpdates, markBlogSeen, parseBlogSeen, readBlogSeen, subscribeBlogSeen, type BlogRevision } from "@/lib/blog-read-state";

export function BlogNavigationLink({ userId, revision }: { userId: string; revision: BlogRevision | null }) {
  const subscribe = useCallback((listener: () => void) => subscribeBlogSeen(userId, listener), [userId]);
  const snapshot = useCallback(() => readBlogSeen(userId), [userId]);
  const seen = useSyncExternalStore(subscribe, snapshot, () => undefined);
  const hasUpdates = seen !== undefined && blogHasUpdates(revision, parseBlogSeen(seen));
  return <NavigationLink prefetch={false} href="/blog" icon={<Rss size={20} className="text-accent" />} label="ブログ"
    trailing={hasUpdates ? <span role="status" className="flex shrink-0 items-center"><span aria-hidden="true" className="size-2.5 rounded-full bg-blue-500" /><span className="sr-only">新しい更新があります</span></span> : undefined} />;
}

export function BlogReadMarker({ userId, revision }: { userId: string; revision: BlogRevision }) {
  useEffect(() => { markBlogSeen(userId, revision); }, [userId, revision]);
  return null;
}
