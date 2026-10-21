import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { ServiceStatus } from "@/lib/service-status";

const state = vi.hoisted(() => ({ data: undefined as ServiceStatus | undefined }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ ...state, isPending: false, isError: false, isFetching: false, refetch: vi.fn() }) }));
import { ServiceStatusPanel } from "./ServiceStatusPanel";

beforeEach(() => {
  state.data = {
    runtime: "pc", checkedAt: "2026-10-22T00:00:00Z",
    health: { cloudflare: { indicator: "none", incidents: [] }, supabase: { indicator: "unknown", incidents: [] }, vercel: { indicator: "unknown", incidents: [] } },
    r2: { state: "ready", bytes: 123, objects: 2 },
    vercel: { state: "unconfigured", from: "", to: "", usage: [] },
    images: { backend: "pc", reads: true, writes: true, paused: false, limitBytes: 8000000000 },
  };
});
const render = () => renderToStaticMarkup(createElement(ServiceStatusPanel));

it("gives the club operator the current storage and service administration destinations", () => {
  const html = render();
  expect(html).toContain("本番PC</h2>");
  expect(html).toContain("Google Drive</h2>");
  for (const destination of [
    "https://dash.cloudflare.com/f08f553737bd866b3a6f4ce1f94a8be3",
    "https://drive.google.com/drive/folders/1o5pLXSJqMehrRVZ9k250S9jjFpCXqhDS",
    "https://github.com/tuat-tf/TUAT_TF",
    "https://console.cloud.google.com/apis/credentials?project=tuat-tf",
  ]) expect(html).toContain(`href="${destination}"`);
  for (const retired of ["Supabase</h2>", "Vercel</h2>", "paimondayos", "cctqtlkeltdpjkyyjmfl", "/r2/overview"]) expect(html).not.toContain(retired);
});

it("preserves capacity failures and the existing image write pause", () => {
  state.data!.r2 = { state: "error", bytes: null, objects: null };
  state.data!.images.paused = true;
  const html = render();
  expect(html).toContain("保存容量: 取得できませんでした");
  expect(html).toContain("一時停止中");
  expect(html).not.toContain("<progress");
  expect(html).not.toContain("0ファイル");
});

it("keeps non-PC provider views available without hard-coded personal account links", () => {
  state.data!.runtime = "cloud";
  const html = render();
  expect(html).toContain('href="https://supabase.com/dashboard"');
  expect(html).toContain('href="https://vercel.com/dashboard"');
  expect(html).not.toContain("paimondayos");
  expect(html).not.toContain("cctqtlkeltdpjkyyjmfl");
});
