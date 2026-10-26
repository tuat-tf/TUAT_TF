import { describe, expect, it } from "vitest";
import { completeHashtag, extractHashtags, rankHashtags, splitHashtags, suggestHashtags, trailingHashtagQuery } from "./hashtags";

describe("hashtags", () => {
  it("finds tags in Japanese text and stops at punctuation", () => {
    expect(extractHashtags("部活後ジム直行\n#アルファ男性への道 #load to alpha\n今日は＃朝練、楽しかった")).toEqual(["アルファ男性への道", "load", "朝練"]);
  });

  it("skips numbers, C# and duplicates", () => {
    expect(extractHashtags("#1 C#を勉強 &#123; #朝練 #朝練")).toEqual(["朝練"]);
  });

  it("splits text around tags without losing characters", () => {
    const text = "今日の#朝練。明日も#朝練";
    const parts = splitHashtags(text);
    expect(parts).toEqual(["今日の", { tag: "朝練" }, "。明日も", { tag: "朝練" }]);
    expect(parts.map((part) => typeof part === "string" ? part : `#${part.tag}`).join("")).toBe(text);
  });

  it("reads and completes the tag being typed", () => {
    expect(trailingHashtagQuery("今日は #朝")).toBe("朝");
    expect(trailingHashtagQuery("今日は #")).toBe("");
    expect(trailingHashtagQuery("今日は #朝練 ")).toBeNull();
    expect(trailingHashtagQuery("C#")).toBeNull();
    expect(completeHashtag("今日は ＃朝", "朝練")).toBe("今日は #朝練 ");
  });

  it("ranks recent and own tags first and keeps the latest spelling", () => {
    const now = Date.parse("2026-10-26T00:00:00Z");
    const ranked = rankHashtags([
      { text: "#Old", createdAt: "2026-09-01T00:00:00Z", mine: false },
      { text: "#old", createdAt: "2026-09-02T00:00:00Z", mine: false },
      { text: "#朝練", createdAt: "2026-10-25T00:00:00Z", mine: false },
      { text: "#mine", createdAt: "2026-10-20T00:00:00Z", mine: true },
    ], now);
    expect(ranked.map((item) => item.tag)).toEqual(["朝練", "mine", "old"]);
    expect(ranked[2].count).toBe(2);
  });

  it("suggests prefix matches before inner matches and hides the exact tag", () => {
    const ranked = [{ tag: "朝練", count: 1, score: 3 }, { tag: "土曜朝練", count: 1, score: 2 }, { tag: "朝練習", count: 1, score: 1 }];
    expect(suggestHashtags(ranked, "朝練").map((item) => item.tag)).toEqual(["朝練習", "土曜朝練"]);
    expect(suggestHashtags(ranked, "").length).toBe(3);
  });
});
