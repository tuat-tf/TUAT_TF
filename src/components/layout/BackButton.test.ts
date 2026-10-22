import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ router: { back: vi.fn(), push: vi.fn(), replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/components/layout/glass/system-glass-state", () => ({ useSystemGlass: () => true }));
import { BackButton } from "./BackButton";

const origin = "https://app.example.invalid";
const program = origin + "/competitions/ob/program?view=operations";
let location: { href: string; origin: string };
function browser({ length = 2, referrer = "", documentUrl = program, canGoBack }: { length?: number; referrer?: string; documentUrl?: string; canGoBack?: boolean } = {}) {
  location = { href: program, origin };
  vi.stubGlobal("window", { location, history: { length }, setTimeout, ...(canGoBack !== undefined ? { navigation: { canGoBack } } : {}) });
  vi.stubGlobal("document", { referrer });
  vi.stubGlobal("performance", { getEntriesByType: () => [{ name: documentUrl }] });
}
function click(props: Parameters<typeof BackButton>[0] = {}) { BackButton(props).props.onClick(); }
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); browser(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([
  ["/admin/members", "/members/other?from=management", "/admin/members?member=other"],
  ["/admin/members", "/admin/sheets/other?from=management", "/admin/members?member=other"],
  ["/mypage", "/blog", "/mypage"],
  ["/mypage", "/club-records", "/mypage"],
  ["/club-records", "/club-records/track", "/club-records"],
])("does not revisit %s's child after an explicit return and another back", (parent, child, fallback) => {
  browser({ canGoBack: true });
  const entries = ["/home", parent, child];
  let index = entries.length - 1;
  const update = () => { location.href = origin + entries[index]; };
  update();
  mocks.router.push.mockImplementation((path: string) => { entries.splice(++index); entries.push(path); update(); });
  mocks.router.replace.mockImplementation((path: string) => { entries[index] = path; update(); });
  mocks.router.back.mockImplementation(() => { index--; update(); });
  click({ fallback, forceFallback: true });
  expect(location.href).toBe(origin + fallback);
  click({ fallback: "/home" });
  vi.advanceTimersByTime(500);
  expect(location.href).not.toBe(origin + child);
  expect(mocks.router.push).not.toHaveBeenCalled();
});

it("uses the screen fallback for a direct tab despite the initial blank history entry", () => {
  browser({ canGoBack: false }); click({ fallback: "/home" });
  expect(mocks.router.back).not.toHaveBeenCalled(); expect(mocks.router.replace).toHaveBeenCalledWith("/home");
});
it("returns through known app history even when SPA navigation has no document referrer", () => {
  browser({ canGoBack: true }); click();
  expect(mocks.router.back).toHaveBeenCalledOnce(); expect(mocks.router.push).not.toHaveBeenCalled();
});
it.each(["/members/other?from=management#results", "/admin/sheets/other?from=management"])("returns from %s through management to admin without duplicate screens", child => {
  browser({ canGoBack: true });
  const entries = ["/admin", "/admin/members", child];
  let index = 2;
  location.href = origin + entries[index];
  mocks.router.back.mockImplementation(() => { location.href = origin + entries[--index]; });
  click({ fallback: "/admin/members?member=other" });
  expect(location.href).toBe(origin + "/admin/members");
  vi.advanceTimersByTime(500);
  click({ fallback: "/admin" });
  expect(location.href).toBe(origin + "/admin");
  vi.advanceTimersByTime(500);
  expect(mocks.router.replace).not.toHaveBeenCalled();
  expect(mocks.router.push).not.toHaveBeenCalled();
});
it("keeps the direct-tab fallback after its inner view is replaced", () => {
  browser({ canGoBack: false }); location.href = origin + "/competitions/ob/program?view=participant"; click();
  expect(mocks.router.back).not.toHaveBeenCalled(); expect(mocks.router.replace).toHaveBeenCalledWith("/home");
});
it("does not override a known absent app entry with the referrer", () => {
  browser({ canGoBack: false, referrer: origin + "/home" }); click();
  expect(mocks.router.back).not.toHaveBeenCalled(); expect(mocks.router.replace).toHaveBeenCalledWith("/home");
});
it("supports a same-origin document opener without Navigation API", () => {
  browser({ referrer: origin + "/schedule" }); click();
  expect(mocks.router.back).toHaveBeenCalledOnce(); expect(mocks.router.push).not.toHaveBeenCalled();
});
it.each(["", "https://outside.example.invalid/mail", program, "invalid-url"])("uses fallback for a directly opened document with referrer %s", referrer => {
  browser({ length: 8, referrer }); click({ fallback: "/competitions" });
  expect(mocks.router.back).not.toHaveBeenCalled(); expect(mocks.router.replace).toHaveBeenCalledWith("/competitions");
});
it("keeps home to program to inner replace back working without Navigation API", () => {
  browser({ length: 3, documentUrl: origin + "/home" });
  location.href = origin + "/competitions/ob/program?view=participant"; click();
  expect(mocks.router.back).toHaveBeenCalledOnce(); expect(mocks.router.push).not.toHaveBeenCalled();
});
it("does not treat direct document query replacement as an app opener", () => {
  browser(); location.href = origin + "/competitions/ob/program?view=participant"; click();
  expect(mocks.router.back).not.toHaveBeenCalled(); expect(mocks.router.replace).toHaveBeenCalledWith("/home");
});
it("keeps an explicit screen return even when an app predecessor exists", () => {
  browser({ canGoBack: true }); click({ fallback: "/competitions", forceFallback: true });
  expect(mocks.router.back).not.toHaveBeenCalled(); expect(mocks.router.replace).toHaveBeenCalledWith("/competitions");
});
it("uses the existing fallback if back has no effect", () => {
  browser({ canGoBack: true }); click(); vi.advanceTimersByTime(500);
  expect(mocks.router.back).toHaveBeenCalledOnce(); expect(mocks.router.replace).toHaveBeenCalledWith("/home");
});
it("does not add a second navigation after a successful back", () => {
  browser({ canGoBack: true }); click(); location.href = origin + "/schedule"; vi.advanceTimersByTime(500);
  expect(mocks.router.back).toHaveBeenCalledOnce(); expect(mocks.router.push).not.toHaveBeenCalled();
});
