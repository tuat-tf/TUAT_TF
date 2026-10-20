import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { Avatar } from "./Avatar";

afterEach(() => vi.unstubAllEnvs());

it("uses the private thumbnail without changing the avatar's displayed size", () => {
  vi.stubEnv("NEXT_PUBLIC_IMAGE_DELIVERY_VERSION", "");
  const html = renderToStaticMarkup(createElement(Avatar, {
    name: "部員", avatarUrl: "user-1/avatar.webp", size: "lg", className: "ring-2",
  }));
  expect(html).toContain('src="/api/avatar/image?path=user-1%2Favatar.webp&amp;variant=thumbnail"');
  expect(html).toContain("h-16 w-16");
  expect(html).toContain("ring-2");
  expect(html).toContain('alt="部員"');
});

it.each(["https://images.example.com/avatar.jpg", "blob:https://app.example/preview"])(
  "preserves an external or unsaved avatar: %s",
  avatarUrl => {
    const html = renderToStaticMarkup(createElement(Avatar, { name: "部員", avatarUrl }));
    expect(html).toContain(`src="${avatarUrl}"`);
    expect(html).not.toContain("variant=thumbnail");
  },
);

it("keeps the initials fallback when no image was selected", () => {
  const html = renderToStaticMarkup(createElement(Avatar, { name: "部員", avatarUrl: null }));
  expect(html).not.toContain("<img");
  expect(html).toContain(">部</div>");
});
