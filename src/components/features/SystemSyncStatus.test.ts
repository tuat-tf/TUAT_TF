import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ health: null as unknown, error: false }));
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useState(initial: unknown) {
    return [initial === null ? state.health : initial === false ? state.error : initial, vi.fn()];
  },
}));
import { SystemSyncStatus } from "./SystemSyncStatus";

function health(status = "success", overrides = {}) {
  return {
    latest: {
      status,
      startedAt: "2026-10-06T15:00:00.000Z",
      finishedAt: "2026-10-06T15:00:05.000Z",
      pulledCount: 12,
      pushedCount: 2,
      failedCount: 0,
      hasIssue: false,
    },
    pendingPushCount: 0,
    sheetProfileCount: 3,
    ...overrides,
  };
}
function render() { return renderToStaticMarkup(createElement(SystemSyncStatus)); }

beforeEach(() => { state.health = null; state.error = false; });

describe("sheet sync status meaning", () => {
  it("shows loading without a success icon", () => {
    const html = render();
    expect(html).toContain("確認中…");
    expect(html).not.toContain("lucide-circle-check");
    expect(html).not.toContain("text-success");
  });

  it("distinguishes no history from a completed run", () => {
    state.health = health("success", { latest: null });
    const html = render();
    expect(html).toContain("実行履歴はありません");
    expect(html).not.toContain("text-success");
    expect(html).not.toContain("連携は正常");
  });

  it("shows the recorded running state and its start time in Japan", () => {
    state.health = health("running", { latest: { ...health().latest, status: "running", finishedAt: null } });
    const html = render();
    expect(html).toContain("連携を実行中です");
    expect(html).toContain("開始日時");
    expect(html).toContain("2026/10/7 0:00:00");
    expect(html).not.toContain("text-success");
  });

  it("reports the last completed result rather than current system health", () => {
    state.health = health();
    const html = render();
    expect(html).toContain("最終実行は完了しました");
    expect(html).toContain("完了日時");
    expect(html).toContain("2026/10/7 0:00:05");
    expect(html).not.toContain("連携は正常");
  });

  it("keeps pending writes visible even after a successful run", () => {
    state.health = health("success", { pendingPushCount: 1 });
    const html = render();
    expect(html).toContain("未書き込みの記録があります");
    expect(html).not.toContain("text-success");
  });

  it("keeps partial member failures visible", () => {
    state.health = health("error", { latest: { ...health().latest, status: "error", failedCount: 1, hasIssue: true } });
    const html = render();
    expect(html).toContain("最終実行に未解消のエラーがあります");
    expect(html).toContain("未解消エラー");
    expect(html).not.toContain("text-success");
  });

  it("preserves an error run after audited reconciliation", () => {
    state.health = health("error");
    const html = render();
    expect(html).toContain("最終実行のエラーは解消済みです");
    expect(html).not.toContain("最終実行は完了しました");
  });

  it("offers a safe read retry when status retrieval fails", () => {
    state.error = true;
    const html = render();
    expect(html).toContain("状態を取得できません");
    expect(html).toContain("時間をおいて再確認してください");
    expect(html).not.toContain("text-success");
  });
});
