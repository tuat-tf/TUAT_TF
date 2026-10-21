import type { MouseEvent, ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ pathname: "/timeline" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
import { DesktopNav } from "./DesktopNav";
afterEach(() => vi.unstubAllGlobals());
it("suppresses only an ordinary click on the current exact route", () => {
  const scrollTo = vi.fn();
  vi.stubGlobal("window", { scrollTo });
  for (const [pathname, overrides, blocked] of [
    ["/timeline", {}, true],
    ["/timeline/detail", {}, false],
    ["/home", {}, false],
    ...["metaKey", "ctrlKey", "shiftKey", "altKey"].map(key => ["/timeline", { [key]: true }, false]),
    ["/timeline", { button: 1 }, false],
  ] as [string, Record<string, unknown>, boolean][]) {
    state.pathname = pathname;
    const links = DesktopNav().props.children.props.children as ReactElement<{ href: string; onClick: (event: MouseEvent) => void }>[];
    const preventDefault = vi.fn();
    links.find(link => link.props.href === "/timeline")!.props.onClick({ button: 0, preventDefault, ...overrides } as unknown as MouseEvent);
    expect(preventDefault).toHaveBeenCalledTimes(blocked ? 1 : 0);
  }
  expect(scrollTo).toHaveBeenCalledOnce();
});
