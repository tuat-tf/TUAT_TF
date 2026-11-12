// 学祭の模擬店（サーターアンダギー）の価格・容器・売上集計。画面とテストで共有する。

/** 学祭ページのタブ。サーバー側のページ（URLの ?tab= の検証）とクライアントの両方で使うので、ここに置く。 */
export const FESTIVAL_TABS = ["instructions", "sales", "stock", "shopping"] as const;
export type FestivalTab = (typeof FESTIVAL_TABS)[number];

/** 1会計で売る個数の上限 */
export const FESTIVAL_MAX_QUANTITY = 20;

/** 個数ごとの価格（円）。添字0が1個。10個以降は1個ごとに50円ずつ上がる。 */
const PRICES = [90, 180, 270, 350, 430, 500, 560, 620, 670, 700, 750, 800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200] as const;

export function isFestivalQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= FESTIVAL_MAX_QUANTITY;
}

/** 個数の価格（円）。1〜20個以外は扱わない。 */
export function festivalPrice(quantity: number): number {
  if (!isFestivalQuantity(quantity)) throw new RangeError("個数は1〜20個で指定してください");
  return PRICES[quantity - 1];
}

/** 容器。1〜3個は紙コップ1個、4〜6個は紙コップ2個、7個以上はプラパック1個。 */
export function festivalContainer(quantity: number): { cups: number; packs: number; label: string } {
  if (!isFestivalQuantity(quantity)) throw new RangeError("個数は1〜20個で指定してください");
  if (quantity <= 3) return { cups: 1, packs: 0, label: "紙コップ" };
  if (quantity <= 6) return { cups: 2, packs: 0, label: "紙コップ2個" };
  return { cups: 0, packs: 1, label: "プラパック" };
}

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

export type FestivalSaleLike = { quantity: number; amount: number; sold_at: string };
export type FestivalTotals = { orders: number; pieces: number; amount: number; cups: number; packs: number };
export type FestivalDaySummary = FestivalTotals & {
  /** YYYY-MM-DD（日本時間） */
  day: string;
  /** 売上があった時間帯だけ、早い順 */
  hours: (FestivalTotals & { hour: number })[];
};

const emptyTotals = (): FestivalTotals => ({ orders: 0, pieces: 0, amount: 0, cups: 0, packs: 0 });

function add(totals: FestivalTotals, sale: FestivalSaleLike) {
  const container = festivalContainer(sale.quantity);
  totals.orders += 1;
  totals.pieces += sale.quantity;
  totals.amount += sale.amount;
  totals.cups += container.cups;
  totals.packs += container.packs;
}

const jstParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
});

/** 売った時刻を日本時間の日付と時（0〜23）に分ける */
export function jstDayHour(iso: string): { day: string; hour: number } {
  const parts = Object.fromEntries(jstParts.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** 日ごと・時間帯ごとの売上。日は新しい順、時間帯は早い順。 */
export function summarizeFestivalSales(sales: FestivalSaleLike[]): FestivalDaySummary[] {
  const days = new Map<string, { totals: FestivalTotals; hours: Map<number, FestivalTotals> }>();
  for (const sale of sales) {
    const { day, hour } = jstDayHour(sale.sold_at);
    const entry = days.get(day) ?? { totals: emptyTotals(), hours: new Map() };
    days.set(day, entry);
    const hourTotals = entry.hours.get(hour) ?? emptyTotals();
    entry.hours.set(hour, hourTotals);
    add(entry.totals, sale);
    add(hourTotals, sale);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, entry]) => ({
      day,
      ...entry.totals,
      hours: [...entry.hours.entries()].sort(([a], [b]) => a - b).map(([hour, totals]) => ({ hour, ...totals })),
    }));
}

const jstTime = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** 「11/14 10:32」の形（日本時間） */
export function formatFestivalTime(iso: string): string {
  return jstTime.format(new Date(iso));
}
