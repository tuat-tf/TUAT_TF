const GOOGLE_HOST = "docs.google.com";
const GOOGLE_CONTENT_SUFFIX = ".googleusercontent.com";

export class GoogleCsvFetchError extends Error {
  constructor(
    message: string,
    readonly kind: "too_large" | "bad_url" | "http" | "network",
  ) {
    super(message);
  }
}

/** 取得先として許すGoogleのホスト（docs.google.com と *.googleusercontent.com）。 */
export function isAllowedGoogleCsvHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === GOOGLE_HOST || host === "googleusercontent.com" || host.endsWith(GOOGLE_CONTENT_SUFFIX);
}

/** https・資格情報なし・ポートなし・許可ホストのURLだけを通す。 */
export function isSafeGoogleCsvUrl(url: URL): boolean {
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    isAllowedGoogleCsvHost(url.hostname)
  );
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const tooLarge = () => new GoogleCsvFetchError("スプレッドシートが大きすぎます", "too_large");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > maxBytes) throw tooLarge();
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

/**
 * GoogleスプレッドシートのCSVを、タイムアウト・サイズ上限・最終URLのホスト確認つきで取得する。
 * 失敗は GoogleCsvFetchError で投げる。
 */
export async function fetchGoogleCsv(
  url: URL,
  options: { timeoutMs: number; maxBytes: number },
): Promise<string> {
  if (!isSafeGoogleCsvUrl(url)) {
    throw new GoogleCsvFetchError("GoogleスプレッドシートのURLが不正です", "bad_url");
  }
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(options.timeoutMs) });
  } catch {
    throw new GoogleCsvFetchError("スプレッドシートを読み込めませんでした", "network");
  }
  if (response.url) {
    let finalUrl: URL | null = null;
    try {
      finalUrl = new URL(response.url);
    } catch {
      finalUrl = null;
    }
    if (!finalUrl || !isSafeGoogleCsvUrl(finalUrl)) {
      throw new GoogleCsvFetchError("スプレッドシートの取得先が想定外です", "bad_url");
    }
  }
  if (!response.ok) throw new GoogleCsvFetchError(`HTTP ${response.status}`, "http");
  try {
    return await readLimitedText(response, options.maxBytes);
  } catch (error) {
    if (error instanceof GoogleCsvFetchError) throw error;
    throw new GoogleCsvFetchError("スプレッドシートを読み込めませんでした", "network");
  }
}
