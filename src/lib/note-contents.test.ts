import { describe, expect, it } from "vitest";
import { folderContentsLabel } from "./note-contents";


describe("folderContentsLabel", () => {
  it("記事だけのフォルダは記事の数だけを出す", () => {
    expect(folderContentsLabel({ article_count: 3 })).toBe("記事3件");
  });

  it("サブフォルダとスレッドも数に入れる", () => {
    expect(folderContentsLabel({ child_count: 2, article_count: 3, thread_count: 1 })).toBe(
      "フォルダ2件 · 記事3件 · スレッド1件",
    );
  });

  it("記事が0件でもスレッドがあれば空扱いにしない", () => {
    expect(folderContentsLabel({ article_count: 0, thread_count: 2 })).toBe("スレッド2件");
  });

  it("本当に空のときだけ空だと伝える", () => {
    expect(folderContentsLabel({ child_count: 0, article_count: 0, thread_count: 0 })).toBe("まだ中身はありません");
  });

  it("取得していない種類は0件として扱う", () => {
    expect(folderContentsLabel({})).toBe("まだ中身はありません");
  });
});
