import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { RefreshStatus } from "./refresh-status";

it("keeps existing content stationary during background updates", () => {
  for (const busy of [false, true, false]) {
    expect(renderToStaticMarkup(createElement(RefreshStatus, { busy, failed: false, retry: vi.fn() }))).toBe("");
  }
});
it("retains initial loading and error recovery without reporting failed requests as empty", () => {
  expect(renderToStaticMarkup(createElement(RefreshStatus, { busy: true, failed: false, hasData: false, retry: vi.fn() }))).toContain("更新中");
  const retry = vi.fn();
  const error = RefreshStatus({ busy: false, failed: true, retry })!;
  const button = error.props.children[1];
  button.props.onClick();
  expect(retry).toHaveBeenCalledOnce();
  expect(renderToStaticMarkup(error)).toContain("前回の内容を表示しています");
  const retrying = renderToStaticMarkup(createElement(RefreshStatus, { busy: true, failed: true, retry }));
  expect(retrying).toContain('disabled=""');
});
