import { describe, expect, it } from "vitest";
import { completeMention, matchesMention, mentionedMembers, mentionQueryAt } from "./mentions";

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

describe("mentionedMembers", () => {
  const members = [{ display_name: "林" }, { display_name: "林田" }, { display_name: "武藤 太郎" }];
  it("finds names typed in full without picking a candidate", () => {
    expect(mentionedMembers("＠武藤 太郎 おつかれ", members).map(m => m.display_name)).toEqual(["武藤 太郎"]);
    expect(mentionedMembers("@林田", members).map(m => m.display_name)).toEqual(["林田"]);
    expect(mentionedMembers("@林、ありがとう", members).map(m => m.display_name)).toEqual(["林"]);
    expect(mentionedMembers("mail a@林", members)).toEqual([]);
  });
});
