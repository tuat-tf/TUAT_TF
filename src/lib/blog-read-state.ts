export type BlogRevision = { hash: string; newestAt: number };
const EVENT = "tuat-blog-read";
const keyFor = (userId: string) => `tuat:blog-read:v1:${userId}`;

export function readBlogSeen(userId: string): string | null {
  try { return window.localStorage.getItem(keyFor(userId)); } catch { return null; }
}

export function parseBlogSeen(raw: string | null): BlogRevision | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return typeof value.hash === "string" && /^[a-f0-9]{64}$/.test(value.hash)
      && Number.isFinite(value.newestAt) && value.newestAt >= 0 ? value : null;
  } catch { return null; }
}

export function blogHasUpdates(current: BlogRevision | null, seen: BlogRevision | null): boolean {
  return current !== null && (!seen || (current.newestAt >= seen.newestAt && current.hash !== seen.hash));
}

export function markBlogSeen(userId: string, current: BlogRevision): void {
  const previous = parseBlogSeen(readBlogSeen(userId));
  if (previous && previous.newestAt > current.newestAt) return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(current));
    window.dispatchEvent(new Event(EVENT));
  } catch { /* Storage may be disabled; reading the blog still works. */ }
}

export function subscribeBlogSeen(userId: string, listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === keyFor(userId) || event.key === null) listener();
  };
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", onStorage); };
}
