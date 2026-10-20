import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { NoteImages } from "./NoteImages";
import { NoteBody } from "./NoteBody";

const key = "11111111-1111-4111-8111-111111111111";
const image = { id: "photo", path: `article/${key}.webp` };

it("loads lazy gallery thumbnails while the enlargement link keeps the original", () => {
  const html = renderToStaticMarkup(createElement(NoteImages, { images: [image] }));
  expect(html).toContain('href="/api/note-image?id=photo"');
  expect(html).toContain('src="/api/note-image?id=photo&amp;variant=thumbnail"');
  expect(html).toContain('loading="lazy"');
  expect(html).toContain("grid-cols-2");
  expect(html).not.toContain('rel="preload"');
});

it("keeps placed and legacy unplaced photos, with original links and thumbnail images", () => {
  const html = renderToStaticMarkup(createElement(NoteBody, {
    body: `写真の前\n[[photo:${key}]]\n写真の後`,
    images: [image, { id: "legacy", path: "legacy/photo.jpg" }],
  }));
  expect(html.match(/<img /g)).toHaveLength(2);
  for (const id of ["photo", "legacy"]) {
    expect(html).toContain(`href="/api/note-image?id=${id}"`);
    expect(html).toContain(`src="/api/note-image?id=${id}&amp;variant=thumbnail"`);
  }
  expect(html).toContain("写真の前");
  expect(html).toContain("写真の後");
  expect(html).not.toContain("[[photo:");
  expect(html).not.toContain('rel="preload"');
});

it("does not create image requests for an empty gallery", () => {
  expect(renderToStaticMarkup(createElement(NoteImages, {}))).toBe("");
});
