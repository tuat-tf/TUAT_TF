import { Children, createElement, isValidElement, type MouseEvent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { TweetWithAuthor } from "@/types";

const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState<T>(initial: T) {
    const slot = hooks.cursor++;
    if (!(slot in hooks.values)) hooks.values[slot] = initial;
    return [hooks.values[slot], (value: T) => { hooks.values[slot] = value; }];
  },
}));
vi.mock("@/components/cards/PostActions", () => ({ PostActions: () => null }));
vi.mock("@/components/cards/PostOwnerMenu", () => ({ TweetOwnerMenu: () => null }));
vi.mock("@/components/features/TweetPoll", () => ({ TweetPoll: () => null }));
// Portals require a browser DOM. Keep the real ImageLightbox condition and image output.
vi.mock("@radix-ui/react-dialog", () => {
  const wrapper = ({ children }: { children: ReactNode }) => createElement("div", {}, children);
  return { Root: wrapper, Portal: wrapper, Overlay: () => null, Content: wrapper, Title: wrapper, Close: wrapper };
});
import { TweetCard } from "./TweetCard";
import { ImageLightbox } from "@/components/ui/image-lightbox";

const path = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.webp";
const originalUrl = `/api/tweet-image?path=${encodeURIComponent(path)}`;
const author = { id: "author", display_name: "投稿者", avatar_url: null, blocks: [], grade: null };
const tweet: TweetWithAuthor = {
  id: "tweet", user_id: author.id, author, content: "写真付きの投稿",
  image_path: path, created_at: "2026-10-20T01:00:00Z", expires_at: null,
  likes_count: 0, poll_multiple: false, poll_anonymous: false, poll_allow_options: false,
};

function render(value = tweet) {
  hooks.cursor = 0;
  const element = TweetCard({ tweet: value, currentUser: author });
  return { element, html: renderToStaticMarkup(element) };
}

function clickImage(node: ReactNode): boolean {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode; "aria-label"?: string; onClick?: (event: MouseEvent) => void }>(child)) continue;
    if (child.type === "button" && child.props["aria-label"] === "画像を拡大") {
      child.props.onClick?.({ stopPropagation: () => {} } as MouseEvent);
      return true;
    }
    if (clickImage(child.props.children)) return true;
  }
  return false;
}

beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
});
afterEach(() => vi.unstubAllGlobals());

it("does not render or preload the original image until enlargement is requested", () => {
  const { html } = render();
  expect(html).toContain(`src="${originalUrl}&amp;variant=thumbnail"`);
  expect(html).toContain('loading="lazy"');
  expect(html).not.toContain(`src="${originalUrl}"`);
  expect(html).not.toContain('rel="preload"');
});

it("opens the original image after clicking the thumbnail", () => {
  vi.stubGlobal("document", {});
  expect(clickImage(render().element)).toBe(true);
  const { html } = render();
  expect(html).toContain(`src="${originalUrl}"`);
  expect(html).toContain(`src="${originalUrl}&amp;variant=thumbnail"`);
});

it("keeps a closed lightbox empty even when a browser document exists", () => {
  vi.stubGlobal("document", {});
  expect(renderToStaticMarkup(createElement(ImageLightbox, {
    src: originalUrl, alt: "投稿画像", open: false, onClose: () => {},
  }))).toBe("");
});

it("does not produce an image request for a text-only tweet", () => {
  expect(render({ ...tweet, image_path: null }).html).not.toContain("/api/tweet-image");
});
