"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type IconType = "image" | "play" | "paperclip" | "G";

interface DottedIconProps extends React.SVGAttributes<SVGSVGElement> {
  /** Type of icon to render */
  icon: IconType;
  /** Size of the icon in pixels */
  size?: number;
  /** Color of the dots */
  color?: string;
  /** Opacity of the dots */
  opacity?: number;
}

// 8x8 dot patterns for icons (more detailed)
const iconPatterns: Record<IconType, number[][]> = {
  image: [
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 1, 0, 1],
    [1, 0, 0, 1, 1, 0, 0, 1],
    [1, 0, 1, 0, 0, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1],
  ],
  play: [
    [0, 0, 1, 0, 0, 0, 0, 0],
    [0, 0, 1, 1, 0, 0, 0, 0],
    [0, 0, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 0, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0, 0, 0],
  ],
  paperclip: [
    [0, 0, 0, 1, 1, 1, 0, 0],
    [0, 0, 1, 0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0, 0, 1, 0],
    [0, 0, 1, 0, 0, 0, 1, 0],
    [0, 1, 0, 0, 0, 0, 1, 0],
    [0, 1, 0, 0, 0, 1, 0, 0],
    [0, 1, 0, 0, 0, 1, 0, 0],
    [0, 0, 1, 1, 1, 0, 0, 0],
  ],
  G: [
    [0, 0, 1, 1, 1, 1, 0, 0],
    [0, 1, 0, 0, 0, 0, 1, 0],
    [1, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 0, 0, 0, 0],
    [1, 0, 0, 0, 1, 1, 1, 0],
    [1, 0, 0, 0, 0, 0, 1, 0],
    [0, 1, 0, 0, 0, 0, 1, 0],
    [0, 0, 1, 1, 1, 1, 0, 0],
  ],
};

function DottedIcon({
  icon,
  size = 16,
  color = "currentColor",
  opacity = 1,
  className,
  ...props
}: DottedIconProps) {
  const pattern = iconPatterns[icon];
  const gridSize = pattern.length;
  const dotSize = size / gridSize;
  const gap = dotSize * 0.2;
  const actualDotSize = dotSize - gap;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
      {...props}
    >
      {pattern.map((row, rowIndex) =>
        row.map((cell, colIndex) =>
          cell === 1 ? (
            <rect
              key={`${rowIndex}-${colIndex}`}
              x={colIndex * dotSize + gap / 2}
              y={rowIndex * dotSize + gap / 2}
              width={actualDotSize}
              height={actualDotSize}
              rx={actualDotSize / 4}
              fill={color}
              opacity={opacity}
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

export { DottedIcon, iconPatterns };
export type { DottedIconProps, IconType };
