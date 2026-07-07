export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Gap kept between placed items, in canvas units.
const GAP = 40;
// Where the very first item lands on an empty canvas.
const ORIGIN = { x: 80, y: 80 };

function overlaps(
  x: number,
  y: number,
  w: number,
  h: number,
  r: Rect,
): boolean {
  return (
    x < r.x + r.width + GAP &&
    x + w + GAP > r.x &&
    y < r.y + r.height + GAP &&
    y + h + GAP > r.y
  );
}

// Pick a spot for a new `width`×`height` item that doesn't overlap anything in
// `existing`. Scans left-to-right, top-to-bottom on a grid anchored at the
// top-left of existing content (so new items cluster near what's already there
// and fill gaps left by deletions); if nothing inside the current bounding box
// is free, drops the item to the right of everything on the top baseline.
//
// ponytail: greedy first-fit, O(candidates × existing). Fine for a hand-drawn
// canvas (tens of items); switch to a packing structure if it ever holds
// thousands. Never wraps to a new row on its own — a long run becomes a
// horizontal strip, which matches how the canvas already lays assets out.
export function findOpenSpot(
  existing: Rect[],
  width: number,
  height: number,
  preferred?: { x: number; y: number },
): { x: number; y: number } {
  // Honour a caller-reserved spot when it's still free (the client reserves the
  // slot on click and the server places the asset there) so the placeholder and
  // the final asset land in exactly the same place.
  if (
    preferred &&
    !existing.some((r) => overlaps(preferred.x, preferred.y, width, height, r))
  ) {
    return { x: preferred.x, y: preferred.y };
  }
  if (existing.length === 0) return { ...ORIGIN };

  const minX = Math.min(...existing.map((r) => r.x));
  const minY = Math.min(...existing.map((r) => r.y));
  const maxX = Math.max(...existing.map((r) => r.x + r.width));
  const maxY = Math.max(...existing.map((r) => r.y + r.height));

  const stepX = width + GAP;
  const stepY = height + GAP;

  for (let y = minY; y <= maxY; y += stepY) {
    for (let x = minX; x <= maxX; x += stepX) {
      if (!existing.some((r) => overlaps(x, y, width, height, r))) {
        return { x, y };
      }
    }
  }
  return { x: maxX + GAP, y: minY };
}

// Pixel dimensions for a requested output, so the loading placeholder matches
// the size of the asset that will replace it. Mirrors fal's named image_size
// presets; unknown sizes (video aspect ratios, "auto") fall back to the same
// defaults persistAgentAsset uses server-side, keeping placeholder and asset
// aligned.
const IMAGE_SIZE_DIMS: Record<string, { width: number; height: number }> = {
  square_hd: { width: 1024, height: 1024 },
  square: { width: 512, height: 512 },
  portrait_4_3: { width: 768, height: 1024 },
  portrait_16_9: { width: 576, height: 1024 },
  landscape_4_3: { width: 1024, height: 768 },
  landscape_16_9: { width: 1024, height: 576 },
};

export function dimsForOutput(
  imageSize: string | undefined,
  kind: "image" | "video",
): { width: number; height: number } {
  if (imageSize && IMAGE_SIZE_DIMS[imageSize])
    return IMAGE_SIZE_DIMS[imageSize];
  return kind === "video"
    ? { width: 1280, height: 720 }
    : { width: 1024, height: 1024 };
}
