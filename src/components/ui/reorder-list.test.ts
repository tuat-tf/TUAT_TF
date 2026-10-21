import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { DragEndEvent } from "@dnd-kit/core";
const capture = vi.hoisted(() => ({ drop: null as ((event: DragEndEvent) => void) | null }));
vi.mock("@dnd-kit/core", async original => ({
  ...await original<typeof import("@dnd-kit/core")>(),
  DndContext: ({ onDragEnd, children }: { onDragEnd: (event: DragEndEvent) => void; children: ReactNode }) => { capture.drop = onDragEnd; return children; },
}));
import { ReorderList } from "./reorder-list";

it.each(["swap", "insert"] as const)("uses %s semantics across multiple positions", mode => {
  const items = ["one", "two", "three", "four"].map(id => ({ id })), changed = vi.fn();
  renderToStaticMarkup(createElement(ReorderList, { items, enabled: true, mode, onReorder: changed, renderItem: item => item.id }));
  capture.drop!({ active: { id: "one" }, over: { id: "four" } } as DragEndEvent);
  expect(changed.mock.lastCall![0].map((item: { id: string }) => item.id)).toEqual(mode === "swap" ? ["four", "two", "three", "one"] : ["two", "three", "four", "one"]);
  expect(items.map(item => item.id)).toEqual(["one", "two", "three", "four"]);
});
it("does not swap a locked source or destination", () => {
  const changed = vi.fn(), items = ["one", "locked", "three"].map(id => ({ id }));
  renderToStaticMarkup(createElement(ReorderList, { items, enabled: true, mode: "swap", onReorder: changed, isItemDisabled: item => item.id === "locked", renderItem: item => item.id }));
  for (const [from, to] of [["one", "locked"], ["locked", "three"]]) capture.drop!({ active: { id: from }, over: { id: to } } as DragEndEvent);
  expect(changed).not.toHaveBeenCalled();
});
