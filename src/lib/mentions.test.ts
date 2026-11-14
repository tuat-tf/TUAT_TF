import { describe, expect, it } from "vitest";
import { completeMention, matchesMention, mentionQueryAt, mentionSpans, resolveMentions } from "./mentions";

describe("mentionQueryAt", () => {
  it("finds a half-width or full-width @ before the cursor", () => {
    expect(mentionQueryAt("おつかれ @たな", null)).toBe("たな");
    expect(mentionQueryAt("おつかれ ＠たな", null)).toBe("たな");
    expect(mentionQueryAt("@", null)).toBe("");
    expect(mentionQueryAt("＠", 1)).toBe("");
  });

  it("works at the cursor, not only at the end of the text", () => {
    const text = "@た 今日はおつかれ";
    expect(mentionQueryAt(text, 2)).toBe("た");
    expect(mentionQueryAt(text, text.length)).toBeNull();
  });

  it("ignores finished names and email addresses", () => {
    expect(mentionQueryAt("@田中 おつかれ", null)).toBeNull();
    expect(mentionQueryAt("mail me at a@b", null)).toBeNull();
  });
});

describe("completeMention", () => {
  it("replaces the half-typed name at the cursor and puts the cursor after it", () => {
    expect(completeMention("＠たな", null, "田中")).toEqual({ text: "@田中 ", caret: 4 });
    expect(completeMention("@た 今日はおつかれ", 2, "田中")).toEqual({ text: "@田中 今日はおつかれ", caret: 4 });
    expect(completeMention("おつかれ @た", null, "田中")).toEqual({ text: "おつかれ @田中 ", caret: 9 });
  });
});

describe("matchesMention", () => {
  it("matches the name or the reading", () => {
    expect(matchesMention({ display_name: "田中", mention_reading: "たなか" }, "たな")).toBe(true);
    expect(matchesMention({ display_name: "Tanaka", mention_reading: null }, "tan")).toBe(true);
    expect(matchesMention({ display_name: "田中", mention_reading: "たなか" }, "さと")).toBe(false);
  });
});

describe("iPhone composition caret", () => {
  it("falls back to the @ at the end when the caret is reported before the composing text", () => {
    expect(mentionQueryAt("＠むと", 0)).toBe("むと");
    expect(completeMention("おつかれ ＠むと", 5, "武藤")).toEqual({ text: "おつかれ @武藤 ", caret: 9 });
  });
});

describe("resolveMentions", () => {
  const members = [{ id: "a", display_name: "林" }, { id: "b", display_name: "林田" }, { id: "c", display_name: "武藤 太郎" }];
  const ids = (text: string, picked: string[] = [], list = members) => resolveMentions(text, list, picked).map(m => m.id);
  it("finds names typed in full without picking a candidate", () => {
    expect(ids("＠武藤 太郎 おつかれ")).toEqual(["c"]);
    expect(ids("@林田")).toEqual(["b"]);
    expect(ids("@林、ありがとう")).toEqual(["a"]);
    expect(ids("mail a@林")).toEqual([]);
  });
  it("keeps a picked member when text follows the name, but never reads a longer name as the shorter one", () => {
    expect(ids("@林さん")).toEqual([]);
    expect(ids("@林さん", ["a"])).toEqual(["a"]);
    expect(ids("@林田さん", ["a"])).toEqual([]);
  });
  it("mentions nobody for a shared name unless one of them was picked", () => {
    const twins = [{ id: "x", display_name: "山田" }, { id: "y", display_name: "山田" }];
    expect(ids("@山田 ", [], twins)).toEqual([]);
    expect(ids("@山田 ", ["y"], twins)).toEqual(["y"]);
  });
  it("keeps an existing mention written under an old name when editing, and drops it once the name is erased", () => {
    const list = [{ id: "a", display_name: "旧姓" }, { id: "a", display_name: "林" }];
    expect(ids("@旧姓 おつかれ", ["a"], list)).toEqual(["a"]);
    expect(ids("おつかれ", ["a"], list)).toEqual([]);
  });
});

describe("mentionSpans", () => {
  it("returns the position of each written name, longest name first, for both @ and ＠", () => {
    expect(mentionSpans("@林田 と ＠林", ["林", "林田"])).toEqual([
      { start: 0, end: 3, name: "林田" }, { start: 6, end: 8, name: "林" },
    ]);
    expect(mentionSpans("a@林", ["林"])).toEqual([]);
  });
});
