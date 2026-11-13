/**
 * 学祭の売上を、電波が無くても入れられるようにする（2026-11-13 所有者の依頼）。
 *
 * 押した売上はまず端末（localStorage）に置き、そこから順にサーバーへ送る。
 * ・IDは端末で決める。送れたか分からないまま送り直しても、同じIDなので2件にならない
 *   （2回目は「もうある」で返るので、それを送れた扱いにする）。
 * ・売った時刻も端末で決める。つながったのが後でも、時間帯ごとの集計がずれない。
 *   DBは12時間前までの時刻を受け付ける（20261113090000_festival_offline_sales.sql）。
 * ・電波が戻らない・タイムアウトしたものは残して、あとで送り直す。
 *   DBに断られたもの（権限が無い・古すぎる等）は送り直しても通らないので「送れなかった」として残す。
 */

export type PendingFestivalSale = {
  id: string;
  quantity: number;
  amount: number;
  soldAt: string;
  recordedBy: string;
  /** DBに断られた理由。あるものは自動では送り直さない。 */
  failed?: string;
};

const STORAGE_KEY = "tuat-festival-pending-sales";
const listeners = new Set<() => void>();
const EMPTY: PendingFestivalSale[] = [];
let cache: PendingFestivalSale[] | null = null;

function read(): PendingFestivalSale[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    cache = Array.isArray(parsed) ? parsed.filter(isPendingSale) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: PendingFestivalSale[]) {
  cache = next;
  try {
    if (next.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 端末の保存領域が使えなくても、開いている間はメモリ上の分で送る。
  }
  for (const listener of listeners) listener();
}

function isPendingSale(value: unknown): value is PendingFestivalSale {
  if (!value || typeof value !== "object") return false;
  const sale = value as Record<string, unknown>;
  return typeof sale.id === "string" && typeof sale.quantity === "number" && typeof sale.amount === "number"
    && typeof sale.soldAt === "string" && typeof sale.recordedBy === "string";
}

export function getPendingSales() {
  return read();
}

export function getServerPendingSales() {
  return EMPTY;
}

export function subscribePendingSales(listener: () => void) {
  listeners.add(listener);
  // ほかのタブで入れた分も反映する。
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    cache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function addPendingSale(sale: PendingFestivalSale) {
  write([...read(), sale]);
}

export function removePendingSale(id: string) {
  write(read().filter((sale) => sale.id !== id));
}

/** 断られたものを、もう一度送る対象に戻す */
export function retryPendingSale(id: string) {
  write(read().map((sale) => (sale.id === id ? { ...sale, failed: undefined } : sale)));
}

function markFailed(id: string, reason: string) {
  write(read().map((sale) => (sale.id === id ? { ...sale, failed: reason } : sale)));
}

export type SendOutcome = "sent" | "retry" | "rejected";

/**
 * 送った結果の分け方。
 * 23505 = 同じIDがもうある（前に送れていた）→ 送れた扱い。
 * Postgresの5桁のコードは、DBが中身を見て断ったもの → 送り直しても通らない。
 * ただし08（接続）・40（直列化の失敗）・53/57（資源不足・停止）は一時的なので送り直す。
 * それ以外（通信の失敗・タイムアウト・PostgRESTのPGRST…・JWT期限切れ）は送り直す。
 */
export function classifySendError(error: { code?: string | null } | null): SendOutcome {
  if (!error) return "sent";
  const code = error.code ?? "";
  if (code === "23505") return "sent";
  if (/^[0-9A-Z]{5}$/.test(code) && !code.startsWith("PGRST") && !/^(08|40|53|57)/.test(code)) return "rejected";
  return "retry";
}

/** 断られたときに出す理由 */
export function rejectedReason(code: string | null | undefined) {
  if (code === "42501") return "送る権限がないか、12時間より前の売上です";
  if (code === "23514") return "個数か金額が正しくありません";
  return "サーバーに受け付けられませんでした";
}

type Insert = (sale: PendingFestivalSale, signal: AbortSignal) => PromiseLike<{ error: { code?: string | null } | null }>;

const SEND_TIMEOUT_MS = 10_000;
let flushing: Promise<number> | null = null;

/**
 * 残っている売上を古い順に送る。送れた件数を返す。
 * 電波が悪いと1件目で詰まるので、送り直しになった時点でその回はやめる（次の機会にまとめて送る）。
 * 同時に2回走らせない。
 */
export function flushPendingSales(insert: Insert): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const sale of read().filter((item) => !item.failed)) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
      let outcome: SendOutcome;
      let code: string | null | undefined;
      try {
        const { error } = await insert(sale, controller.signal);
        outcome = classifySendError(error);
        code = error?.code;
      } catch {
        outcome = "retry";
      } finally {
        clearTimeout(timer);
      }
      if (outcome === "retry") break;
      if (outcome === "sent") {
        removePendingSale(sale.id);
        sent += 1;
      } else {
        markFailed(sale.id, rejectedReason(code));
      }
    }
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** テスト用: 端末に置いた分のキャッシュを捨てる */
export function resetPendingSalesForTest() {
  cache = null;
  flushing = null;
}
