// 同期の入出力の形。

export type { SheetMember } from "@/lib/sheet-public-csv";

export type SyncOptions = {
  dryRun?: boolean;
  onlySheet?: string;
  onlySheets?: string[];
  /** 結果不明の送信を保留し、通常の取り込みだけを継続する復旧モード。 */
  skipSheetWrites?: boolean;
  /** 定期取り込みは前日まで。当日の明示的な手動取り込みは既定で許可する。 */
  includeToday?: boolean;
  /** 手動の一括取り込み用。最新の対象日より前の新規行を、同期時刻ではなく練習日0時(JST)の投稿として扱う。既定はオフ。 */
  backfillAtRecordDate?: boolean;
};

export type SyncResult = {
  inserted: number; // スプシ→アプリ 新規取込
  updated: number; // スプシ→アプリ 更新取込
  pushed: number; // アプリ→スプシ 書き戻し
  conflicts: string[]; // 同日に複数記録があり安全のためスキップした "シート名 日付"
  skippedMembers: string[];
  /** 前回取得時とCSV本文が同一で、解析・DB突合を省略した部員 */
  unchangedMembers: string[];
  /** 部員ごとの失敗（1人の不調で他の部員の同期を止めないための部分失敗設計） */
  failedMembers: { member: string; reason: string }[];
  dryRun: boolean;
  sheetWritesSkipped?: boolean;
  /** A sheet write may have committed without a complete acknowledgement. */
  sheetWritesUncertain?: boolean;
  /** Writes whose response was lost but whose exact payload was found in the published sheet. */
  reconciledWrites?: number;
  /** Write receipts still unresolved after this run (0 lets the scheduler resume writes). */
  unresolvedSheetWrites?: number;
};
