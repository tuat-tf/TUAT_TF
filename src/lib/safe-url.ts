/** リンクとして出してよいURLだけを返す。http(s)の絶対URLで、ユーザー名・パスワードを含まないものに限る。 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
