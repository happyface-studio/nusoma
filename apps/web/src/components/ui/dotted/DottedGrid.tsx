"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DottedGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns in the grid */
  cols?: number;
  /** Number of rows in the grid */
  rows?: number;
  /** Size of each dot in pixels */
  dotSize?: number;
  /** Gap between dots in pixels */
  gap?: number;
  /** Base color for dots */
  color?: string;
  /** Opacity for inactive dots */
  baseOpacity?: number;
  /** Whether to animate the grid */
  animated?: boolean;
  /** Custom pattern - 2D array of opacity values (0-1) */
  pattern?: number[][];
}

function DottedGrid({
  cols = 32,
  rows = 8,
  dotSize = 3,
  gap = 6,
  color = "currentColor",
  baseOpacity = 0.15,
  animated = false,
  pattern,
  className,
  children,
  ...props
}: DottedGridProps) {
  const width = cols * (dotSize + gap) - gap;
  const height = rows * (dotSize + gap) - gap;

  const getOpacity = (row: number, col: number): number => {
    if (pattern && pattern[row] && pattern[row][col] !== undefined) {
      return pattern[row][col];
    }
    return baseOpacity;
  };

  return (
    <div
      className={cn("relative", className)}
      style={{ minWidth: width, minHeight: height }}
      {...props}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0"
      >
        {Array.from({ length: rows }).map((_, row) =>
          Array.from({ length: cols }).map((_, col) => (
            <rect
              key={`${row}-${col}`}
              x={col * (dotSize + gap)}
              y={row * (dotSize + gap)}
              width={dotSize}
              height={dotSize}
              rx={dotSize / 4}
              fill={color}
              opacity={getOpacity(row, col)}
              className={cn(
                "transition-opacity duration-150",
                animated && "animate-pulse",
              )}
            />
          )),
        )}
      </svg>
      {children && (
        <div className="relative z-10 h-full w-full">{children}</div>
      )}
    </div>
  );
}

export { DottedGrid };
export type { DottedGridProps };
