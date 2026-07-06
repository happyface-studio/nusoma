"use client";

import * as React from "react";
import { useMemo, memo } from "react";
import { cn } from "@/lib/utils";

interface DottedRasterTextProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Text to render */
  text: string;
  /** Font family to use */
  fontFamily?: string;
  /** Font weight */
  fontWeight?: number | string;
  /** Height in pixels */
  height?: number;
  /** Resolution (dots per height) */
  resolution?: number;
  /** Color of the dots */
  color?: string;
  /** Threshold for considering a pixel "on" (0-255) */
  threshold?: number;
}

// Cache for rasterized patterns to avoid recalculating
const patternCache = new Map<string, { pattern: number[][]; width: number }>();

function rasterizeText(
  text: string,
  fontFamily: string,
  fontWeight: number | string,
  resolution: number,
  threshold: number,
): { pattern: number[][]; width: number } {
  const cacheKey = `${text}|${fontFamily}|${fontWeight}|${resolution}|${threshold}`;

  const cached = patternCache.get(cacheKey);
  if (cached) return cached;

  // Create off-screen canvas to measure text
  const measureCanvas = document.createElement("canvas");
  measureCanvas.width = 1000;
  measureCanvas.height = 100;
  const measureCtx = measureCanvas.getContext("2d");

  if (!measureCtx) return { pattern: [], width: 0 };

  // Use a larger font size for better measurement, then scale down
  const scaleFactor = 4;
  const fontSize = resolution * scaleFactor;
  measureCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  // Measure text width
  const metrics = measureCtx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const cols = Math.ceil(textWidth / scaleFactor) + 2; // Add padding

  // Create canvas with correct dimensions (scaled up for quality)
  const canvas = document.createElement("canvas");
  canvas.width = cols * scaleFactor;
  canvas.height = resolution * scaleFactor;
  const ctx = canvas.getContext("2d");

  if (!ctx) return { pattern: [], width: 0 };

  // Clear and set up
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  // Draw text (centered vertically)
  ctx.fillText(text, scaleFactor, canvas.height / 2);

  // Sample pixels by scaling down
  const pattern: number[][] = [];
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < resolution; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      // Sample center of each "cell"
      const sampleX = Math.floor(x * scaleFactor + scaleFactor / 2);
      const sampleY = Math.floor(y * scaleFactor + scaleFactor / 2);
      const i = (sampleY * canvas.width + sampleX) * 4;
      const alpha = imageData.data[i + 3] || 0;
      row.push(alpha > threshold ? 1 : 0);
    }
    pattern.push(row);
  }

  const result = { pattern, width: cols };

  // Limit cache size to prevent memory leaks
  if (patternCache.size > 100) {
    const firstKey = patternCache.keys().next().value;
    if (firstKey) patternCache.delete(firstKey);
  }
  patternCache.set(cacheKey, result);

  return result;
}

// Memoized SVG path generator to avoid rendering many rect elements
function generateSvgPath(
  pattern: number[][],
  dotSize: number,
  gap: number,
  actualDotSize: number,
): string {
  const paths: string[] = [];
  const rx = actualDotSize / 4;

  pattern.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell === 1) {
        const x = colIndex * dotSize + gap / 2;
        const y = rowIndex * dotSize + gap / 2;
        // Create rounded rect path
        paths.push(
          `M${x + rx},${y}h${actualDotSize - 2 * rx}a${rx},${rx} 0 0 1 ${rx},${rx}v${actualDotSize - 2 * rx}a${rx},${rx} 0 0 1 -${rx},${rx}h-${actualDotSize - 2 * rx}a${rx},${rx} 0 0 1 -${rx},-${rx}v-${actualDotSize - 2 * rx}a${rx},${rx} 0 0 1 ${rx},-${rx}z`,
        );
      }
    });
  });

  return paths.join("");
}

const DottedRasterText = memo(function DottedRasterText({
  text,
  fontFamily = "Geist Mono, monospace",
  fontWeight = 500,
  height = 12,
  resolution = 8,
  color = "currentColor",
  threshold = 100,
  className,
  ...props
}: DottedRasterTextProps) {
  // Memoize the expensive rasterization
  const { pattern: dotPattern, width } = useMemo(() => {
    if (typeof window === "undefined") return { pattern: [], width: 0 };
    return rasterizeText(text, fontFamily, fontWeight, resolution, threshold);
  }, [text, fontFamily, fontWeight, resolution, threshold]);

  // Memoize dimension calculations
  const { dotSize, gap, actualDotSize, totalWidth, svgPath } = useMemo(() => {
    const dotSize = height / resolution;
    const gap = dotSize * 0.15;
    const actualDotSize = dotSize - gap;
    const totalWidth = width * dotSize;
    const svgPath =
      dotPattern.length > 0
        ? generateSvgPath(dotPattern, dotSize, gap, actualDotSize)
        : "";
    return { dotSize, gap, actualDotSize, totalWidth, svgPath };
  }, [dotPattern, width, height, resolution]);

  if (dotPattern.length === 0 || width === 0) {
    return null;
  }

  return (
    <div className={cn("inline-flex shrink-0", className)} {...props}>
      <svg
        width={totalWidth}
        height={height}
        viewBox={`0 0 ${totalWidth} ${height}`}
      >
        <path d={svgPath} fill={color} />
      </svg>
    </div>
  );
});

export { DottedRasterText };
export type { DottedRasterTextProps };
