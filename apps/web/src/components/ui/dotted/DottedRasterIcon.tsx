"use client";

import * as React from "react";
import { useMemo, useState, useEffect, memo, useRef } from "react";
import { renderToString } from "react-dom/server";
import { cn } from "@/lib/utils";

interface DottedRasterIconProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The icon element to rasterize (e.g., Lucide icon) */
  icon: React.ReactElement;
  /** Output size in pixels */
  size?: number;
  /** Number of dots in the grid (resolution) */
  resolution?: number;
  /** Color of the dots */
  color?: string;
  /** Threshold for considering a pixel "on" (0-255) */
  threshold?: number;
}

// Cache for rasterized icon patterns
const iconPatternCache = new Map<string, number[][]>();

// Generate a unique key for an icon
function getIconKey(
  icon: React.ReactElement,
  resolution: number,
  threshold: number,
): string {
  // Use the icon type name and key props to create a cache key
  const iconType =
    typeof icon.type === "function"
      ? icon.type.name || "unknown"
      : String(icon.type);
  const fill = (icon as React.ReactElement<any>).props.fill || "none";
  const strokeWidth =
    (icon as React.ReactElement<any>).props.strokeWidth ?? "default";
  return `${iconType}|${fill}|${strokeWidth}|${resolution}|${threshold}`;
}

// Memoized SVG path generator
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

const DottedRasterIcon = memo(function DottedRasterIcon({
  icon,
  size = 16,
  resolution = 8,
  color = "currentColor",
  threshold = 128,
  className,
  ...props
}: DottedRasterIconProps) {
  const [dotPattern, setDotPattern] = useState<number[][]>([]);
  const cacheKeyRef = useRef<string>("");

  // Generate cache key
  const cacheKey = useMemo(() => {
    return getIconKey(icon, resolution, threshold);
  }, [icon, resolution, threshold]);

  useEffect(() => {
    // Check cache first
    const cached = iconPatternCache.get(cacheKey);
    if (cached) {
      setDotPattern(cached);
      cacheKeyRef.current = cacheKey;
      return;
    }

    // Use higher resolution for better sampling
    const scaleFactor = 4;
    const canvasSize = resolution * scaleFactor;

    // Create off-screen canvas
    const canvas = document.createElement("canvas");
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // Create an image from the SVG icon
    const svgString = renderToString(
      React.cloneElement(icon as React.ReactElement<any>, {
        width: canvasSize,
        height: canvasSize,
        color: "black",
        stroke: "black",
        fill: (icon as React.ReactElement<any>).props.fill || "none",
        strokeWidth:
          (icon as React.ReactElement<any>).props.strokeWidth ??
          Math.max(2, canvasSize / 10),
      }),
    );

    const img = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvasSize, canvasSize);
      URL.revokeObjectURL(url);

      // Sample pixels by taking center of each cell
      const imageData = ctx.getImageData(0, 0, canvasSize, canvasSize);
      const pattern: number[][] = [];

      for (let y = 0; y < resolution; y++) {
        const row: number[] = [];
        for (let x = 0; x < resolution; x++) {
          // Sample the center of each cell
          const sampleX = Math.floor(x * scaleFactor + scaleFactor / 2);
          const sampleY = Math.floor(y * scaleFactor + scaleFactor / 2);
          const i = (sampleY * canvasSize + sampleX) * 4;
          const alpha = imageData.data[i + 3] || 0;
          row.push(alpha > threshold ? 1 : 0);
        }
        pattern.push(row);
      }

      // Cache the pattern
      if (iconPatternCache.size > 50) {
        const firstKey = iconPatternCache.keys().next().value;
        if (firstKey) iconPatternCache.delete(firstKey);
      }
      iconPatternCache.set(cacheKey, pattern);
      cacheKeyRef.current = cacheKey;

      setDotPattern(pattern);
    };

    img.src = url;
  }, [cacheKey, icon, resolution, threshold]);

  // Memoize SVG path generation
  const { svgPath, dotSize, actualDotSize } = useMemo(() => {
    const dotSize = size / resolution;
    const gap = dotSize * 0.15;
    const actualDotSize = dotSize - gap;
    const svgPath =
      dotPattern.length > 0
        ? generateSvgPath(dotPattern, dotSize, gap, actualDotSize)
        : "";
    return { svgPath, dotSize, actualDotSize };
  }, [dotPattern, size, resolution]);

  if (dotPattern.length === 0) {
    return <div style={{ width: size, height: size }} />;
  }

  return (
    <div className={cn("inline-flex shrink-0", className)} {...props}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path d={svgPath} fill={color} />
      </svg>
    </div>
  );
});

export { DottedRasterIcon };
export type { DottedRasterIconProps };
