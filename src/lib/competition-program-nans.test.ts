import { describe, expect, it } from "vitest";
import { isNansProgramPage, nansRoundEntries, nansRoundUrl, nansRounds, parseNansProgram } from "./competition-program-nans";

const row = (no: string, time: string, place: string, name: string, round: string, kumi: string, link: string) =>
  ({ No: no, KaishiJikan: time, KyogiBasho: place, KyogiMei: name, Round: round, Kumi: kumi, KyogiKekka: "", LinkRound: `${link}#kumi_${kumi}` });
const hurdles = "./result/track/20260908_1-7_ResultTrackA.html", relay = "./result/track/20260908_1-21_ResultTrackB.html", jump = "./result/leap/20260908_1-12_ResultLeapB.html";
const rows = [row("1", "09:00", "トラック", "対校 男子400mH", "ﾀｲﾑﾚｰｽ", "1", hurdles), row("2", "09:00", "トラック", "対校 男子400mH", "ﾀｲﾑﾚｰｽ", "2", hurdles),
  row("3", "10:00", "フィールド", "対校 男子走幅跳", "決　勝", "1", jump), row("4", "15:30", "トラック", "対校 男子4X100mR", "決　勝", "1", relay)];
// The site repeats the same rows under several filter views.
const timetable = { TimeTableList: { "20260908": { Shumoku_a: { Seibetsu_a: { TimeTable: rows } }, Shumoku_1: { Seibetsu_1: { TimeTable: rows.slice(0, 2) } } } } };
const runner = (lane: string, no: string, name: string, team: string, extra: Record<string, string> = {}) =>
  ({ Lane: lane, No: no, KyogishaMei: `ｶﾅ<br/>${name}`, ShozokuMei: `${team}<br/>東　京`, Kiroku: "", Jyuni: "", DnsFlg: "0", ...extra });
const pages = new Map<string, unknown>([
  [hurdles, { ResultInfo: { "1": [
    { Status: "1組 (+1.2)", ResultList: [runner("6", "551", "合成　太郎（M1）", "農工大", { Kiroku: "55.10", Jyuni: "2" }), runner("7", "366", "他大　次郎（3）", "芝浦工業大")] },
    { Status: "2組 ", ResultList: [runner("1", "552", "合成　花子（2）", "農工大", { DnsFlg: "1" })] },
  ] } }],
  [jump, { ResultInfo: [{ Status: "1組 ", ResultList: { "1": [{ Shigi: "2", No: "539", Kyogisha: "ｶﾅ<br/>合成　跳（B3）", Shozoku: "農工大<br/>福　島", Kiroku: "", DnsFlg: "0" }],
    "2": [{ Shigi: "2", No: "539", Kyogisha: "ｶﾅ<br/>合成　跳（B3）", Shozoku: "農工大<br/>福　島", Kiroku: "", DnsFlg: "0" }] } }] }],
  [relay, { ResultInfo: { "1": [{ Status: "1組 ", ResultList: [{ Lane: "4", No: "", Team: "ﾉｳｺｳﾀﾞｲ<br/>農工大", TeamTitle: "農工大", ShozokuMei: "農工大<br/>学　連", Kiroku: "42.10", Jyuni: "1", DnsFlg: "0", TeamMember: null }] }] } }],
]);

describe("Nans21v (JSON) results site", () => {
  it("recognises the Angular shell page", () => {
    expect(isNansProgramPage('<html lang="ja" ng-app="Nans21vApp">')).toBe(true);
    expect(isNansProgramPage("<H2><A Name='1-1'>")).toBe(false);
  });

  it("lists each round once across filter views and keeps heat counts", () => {
    const rounds = nansRounds(timetable);
    expect(rounds.map(r => [r.key, r.label, r.kumi.size])).toEqual([
      ["20260908_1-7_ResultTrackA", "対校 男子400mH タイムレース", 2], ["20260908_1-12_ResultLeapB", "対校 男子走幅跳 決勝", 1], ["20260908_1-21_ResultTrackB", "対校 男子4×100mR 決勝", 1]]);
  });

  it("maps the site's internal date onto the meet day and reads TUAT entries, results, DNS and wind", () => {
    const parsed = parseNansProgram(timetable, pages, "2026-10-25", "2026-10-25");
    expect(parsed.map(r => [r.eventDate, r.block, r.sortOrder, r.timeLabel, r.eventLabel])).toEqual([
      ["2026-10-25", "track", 1, "09:00", "対校 男子400mH タイムレース(2組)"], ["2026-10-25", "field", 1, "10:00", "対校 男子走幅跳 決勝"], ["2026-10-25", "track", 2, "15:30", "対校 男子4×100mR 決勝"]]);
    expect(parsed[0].tuatEntries).toEqual([
      { heat: 1, lane: 6, bib: "551", name: "合成 太郎", grade: "M1", result: { place: "2", record: "55.10", wind: "+1.2" } },
      { heat: 2, lane: 1, bib: "552", name: "合成 花子", grade: "B2", result: { place: null, record: "欠場" } }]);
    // Field order comes from 試技順; the paged result list repeats the athlete once per page.
    expect(parsed[1].tuatEntries).toEqual([{ heat: 1, lane: 2, bib: "539", name: "合成 跳", grade: "B3" }]);
    expect(parsed[2].tuatEntries).toEqual([{ heat: 1, lane: 4, bib: null, name: "農工大", grade: "", result: { place: "1", record: "42.10" } }]);
  });

  it("refuses an incomplete set of round pages or more source days than the meet has", () => {
    expect(() => parseNansProgram(timetable, new Map([...pages].slice(0, 2)), "2026-10-25", null)).toThrow("不完全");
    const twoDays = { TimeTableList: { ...timetable.TimeTableList, "20260909": { Shumoku_a: { Seibetsu_a: { TimeTable: [row("9", "09:00", "トラック", "対校 女子100m", "決勝", "1", "./result/track/20260909_9_ResultTrackA.html")] } } } } };
    expect(() => parseNansProgram(twoDays, pages, "2026-10-25", null)).toThrow("日数");
    expect(() => nansRoundEntries({ Title: "x" }, "track")).toThrow();
  });

  it("only reads round JSON beside the timetable page", () => {
    const page = new URL("http://sairiku.net/result/2026/ageo_1025/shtml/TimeTable.html");
    expect(nansRoundUrl(page, "./result/track/a_ResultTrackA.html").href).toBe("http://sairiku.net/result/2026/ageo_1025/shtml/result/track/a_ResultTrackA.json");
    expect(() => nansRoundUrl(page, "../../other/x.html")).toThrow();
    expect(() => nansRoundUrl(page, "http://evil.example/x.html")).toThrow();
  });
});
