import { describe, expect, it } from "vitest";
import { festivalContainer, festivalPrice, festivalStockLevel, jstDayHour, summarizeFestivalSales } from "./festival";

describe("festival prices", () => {
  it("matches the owner's price table for 1 to 20 pieces", () => {
    const table = [90, 180, 270, 350, 430, 500, 560, 620, 670, 700, 750, 800, 850, 900, 950, 1000, 1050, 1100, 1150, 1200];
    expect(table.map((_, index) => festivalPrice(index + 1))).toEqual(table);
  });
  it("keeps adding 50 yen per piece above 20", () => {
    expect([21, 30, 200].map(festivalPrice)).toEqual([1250, 1700, 10200]);
  });
  it("rejects quantities outside 1 to 200", () => {
    for (const quantity of [0, 201, 1.5, -1]) expect(() => festivalPrice(quantity)).toThrow(RangeError);
  });
  it("picks one cup for 1-3, two cups for 4-6 and a pack from 7", () => {
    expect([1, 3].map((q) => festivalContainer(q))).toEqual([{ cups: 1, packs: 0, label: "紙コップ" }, { cups: 1, packs: 0, label: "紙コップ" }]);
    expect([4, 6].map((q) => festivalContainer(q).cups)).toEqual([2, 2]);
    expect([7, 20].map((q) => festivalContainer(q))).toEqual([{ cups: 0, packs: 1, label: "プラパック" }, { cups: 0, packs: 1, label: "プラパック" }]);
  });
});

describe("festival sales summary", () => {
  it("groups by Japan date and hour, newest day first", () => {
    // 2026-11-14 23:30 UTC は日本時間 11-15 08:30
    expect(jstDayHour("2026-11-14T23:30:00Z")).toEqual({ day: "2026-11-15", hour: 8 });
    const days = summarizeFestivalSales([
      { quantity: 2, amount: 180, sold_at: "2026-11-14T01:10:00Z" },
      { quantity: 5, amount: 430, sold_at: "2026-11-14T01:50:00Z" },
      { quantity: 10, amount: 700, sold_at: "2026-11-14T03:00:00Z" },
      { quantity: 1, amount: 90, sold_at: "2026-11-14T23:30:00Z" },
    ]);
    expect(days.map((day) => day.day)).toEqual(["2026-11-15", "2026-11-14"]);
    expect(days[1]).toMatchObject({ orders: 3, pieces: 17, amount: 1310, cups: 3, packs: 1 });
    expect(days[1].hours).toEqual([
      { hour: 10, orders: 2, pieces: 7, amount: 610, cups: 3, packs: 0 },
      { hour: 12, orders: 1, pieces: 10, amount: 700, cups: 0, packs: 1 },
    ]);
  });
});

describe("festival stock level", () => {
  it("warns at 20% of the prepared amount and reports empty at zero", () => {
    expect(festivalStockLevel(30, 30)).toEqual({ state: "ok", percent: 100 });
    expect(festivalStockLevel(7, 30)).toEqual({ state: "ok", percent: 23 });
    expect(festivalStockLevel(6, 30)).toEqual({ state: "low", percent: 20 });
    expect(festivalStockLevel(0, 30)).toEqual({ state: "empty", percent: 0 });
  });
  it("treats a count above the prepared amount as full", () => {
    expect(festivalStockLevel(12, 10)).toEqual({ state: "ok", percent: 100 });
    expect(festivalStockLevel(0, 0)).toEqual({ state: "empty", percent: 0 });
  });
});
