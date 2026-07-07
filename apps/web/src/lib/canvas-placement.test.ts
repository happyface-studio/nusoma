import { test, expect } from "bun:test";
import { findOpenSpot, dimsForOutput, type Rect } from "./canvas-placement";

const noOverlap = (a: Rect, b: Rect) =>
  a.x + a.width <= b.x ||
  b.x + b.width <= a.x ||
  a.y + a.height <= b.y ||
  b.y + b.height <= a.y;

test("empty canvas places the first item at the origin", () => {
  expect(findOpenSpot([], 1024, 1024)).toEqual({ x: 80, y: 80 });
});

test("a second same-size item lands to the right, not on top", () => {
  const existing: Rect[] = [{ x: 80, y: 80, width: 1024, height: 1024 }];
  const spot = findOpenSpot(existing, 1024, 1024);
  // to the right of the first, sharing its top edge, with a gap
  expect(spot).toEqual({ x: 80 + 1024 + 40, y: 80 });
  expect(noOverlap({ ...spot, width: 1024, height: 1024 }, existing[0])).toBe(
    true,
  );
});

test("never overlaps any existing item", () => {
  const existing: Rect[] = [
    { x: 80, y: 80, width: 1024, height: 1024 },
    { x: 1144, y: 80, width: 1024, height: 1024 },
    { x: 80, y: 1144, width: 512, height: 512 },
  ];
  const spot = findOpenSpot(existing, 1024, 1024);
  const placed: Rect = { ...spot, width: 1024, height: 1024 };
  for (const r of existing) expect(noOverlap(placed, r)).toBe(true);
});

test("a free preferred spot is honoured exactly (client reserves, server obeys)", () => {
  const existing: Rect[] = [{ x: 80, y: 80, width: 1024, height: 1024 }];
  const preferred = { x: 1144, y: 80 };
  expect(findOpenSpot(existing, 1024, 1024, preferred)).toEqual(preferred);
});

test("an occupied preferred spot is ignored and a real gap is used", () => {
  const existing: Rect[] = [{ x: 80, y: 80, width: 1024, height: 1024 }];
  // preferred overlaps the existing item → must not be returned
  const spot = findOpenSpot(existing, 1024, 1024, { x: 80, y: 80 });
  expect(spot).not.toEqual({ x: 80, y: 80 });
});

test("dimsForOutput maps presets and falls back by kind", () => {
  expect(dimsForOutput("landscape_16_9", "image")).toEqual({
    width: 1024,
    height: 576,
  });
  expect(dimsForOutput("portrait_4_3", "image")).toEqual({
    width: 768,
    height: 1024,
  });
  expect(dimsForOutput(undefined, "image")).toEqual({
    width: 1024,
    height: 1024,
  });
  expect(dimsForOutput("auto", "video")).toEqual({ width: 1280, height: 720 });
});

test("fills a gap left by a deletion instead of always growing right", () => {
  // Two items with a full item-sized hole between them on the top row.
  const existing: Rect[] = [
    { x: 80, y: 80, width: 1024, height: 1024 },
    { x: 80 + 2 * (1024 + 40), y: 80, width: 1024, height: 1024 },
  ];
  const spot = findOpenSpot(existing, 1024, 1024);
  expect(spot).toEqual({ x: 80 + 1024 + 40, y: 80 });
});
