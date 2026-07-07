import { test, expect } from "bun:test";
import { applyDragDelta } from "./useSnapDragHandlers";

const items = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 100, y: 100 },
  { id: "c", x: 200, y: 200 },
];
const starts = new Map([
  ["a", { x: 0, y: 0 }],
  ["b", { x: 100, y: 100 }],
]);

test("applyDragDelta moves other selected items by delta from their start positions", () => {
  const out = applyDragDelta(items, ["a", "b"], "a", { x: 10, y: -5 }, starts);
  expect(out.find((i) => i.id === "b")).toEqual({ id: "b", x: 110, y: 95 });
  // dragged item itself is NOT moved by this helper (Konva moves it)
  expect(out.find((i) => i.id === "a")).toEqual({ id: "a", x: 0, y: 0 });
  // unselected item untouched
  expect(out.find((i) => i.id === "c")).toEqual({ id: "c", x: 200, y: 200 });
});

test("applyDragDelta leaves selected items without a start position untouched", () => {
  const out = applyDragDelta(items, ["a", "c"], "a", { x: 10, y: 10 }, starts);
  expect(out.find((i) => i.id === "c")).toEqual({ id: "c", x: 200, y: 200 });
});
