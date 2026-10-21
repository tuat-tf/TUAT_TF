import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { permissionsOf } from "@/lib/permissions";
import type { AppRole } from "@/types";
vi.mock("./ServiceStatusPanel", () => ({ ServiceStatusPanel: () => createElement("p", null, "サービスの状態") }));
vi.mock("./RecordSourceSetting", () => ({ RecordSourceSetting: () => createElement("p", null, "記録の保存先を表示") }));
vi.mock("./MemberPreviewSetting", () => ({ MemberPreviewSetting: () => createElement("p", null, "一般部員の画面を表示") }));
vi.mock("./DashboardRefresh", () => ({ DashboardRefresh: () => null }));
import { AdminDashboard } from "./AdminDashboard";

function render(role: Partial<AppRole>) {
  return renderToStaticMarkup(createElement(AdminDashboard, { snapshot: null, permissions: permissionsOf([role as AppRole]), showRecordSource: false }));
}
it("keeps system settings and sheet management in the management hub without a settings loop", () => {
  const html = render({ can_manage_system: true, can_manage_members: true });
  expect(html).toContain('href="/admin/sheets"');
  expect(html).toContain('href="/admin/members"');
  expect(html).toContain("一般部員の画面を表示");
  expect(html).toContain("部員の大会・記録会の結果");
  expect(html).not.toContain('href="/mypage/settings"');
  expect(html).not.toContain('href="/timeline"');
});
it("offers member-only and schedule-only roles their existing operations without system controls", () => {
  const members = render({ can_manage_members: true });
  expect(members).toContain('href="/admin/members"');
  expect(members).not.toContain('href="/admin/sheets"');
  expect(members).not.toContain("一般部員の画面を表示");
  expect(members).not.toContain("サービスの状態");
  const schedule = render({ can_create_schedule: true });
  expect(schedule).toContain('href="/venues"');
  expect(schedule).not.toContain('href="/admin/members"');
});
