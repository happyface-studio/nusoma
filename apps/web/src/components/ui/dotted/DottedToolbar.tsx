"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useRef, memo } from "react";
import { cn } from "@/lib/utils";

interface DottedToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Grid columns */
  cols?: number;
  /** Grid rows */
  rows?: number;
  /** Dot size in pixels */
  dotSize?: number;
  /** Gap between dots */
  gap?: number;
  /** Base color for dots */
  color?: string;
  /** Whether the toolbar is in active/highlighted state */
  variant?: "default" | "orange" | "blue";
  /** Show loading animation */
  isLoading?: boolean;
}

// Memoized static grid for non-loading state
const StaticGrid = memo(function StaticGrid({
  rows,
  cols,
  dotSize,
  gap,
  color,
  width,
  height,
}: {
  rows: number;
  cols: number;
  dotSize: number;
  gap: number;
  color: string;
  width: number;
  height: number;
}) {
  const rx = dotSize / 3;

  // Pre-compute all rect positions once
  const rects = useMemo(() => {
    const result: Array<{ x: number; y: number }> = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        result.push({
          x: col * (dotSize + gap),
          y: row * (dotSize + gap),
        });
      }
    }
    return result;
  }, [rows, cols, dotSize, gap]);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0"
    >
      {rects.map(({ x, y }, i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={dotSize}
          height={dotSize}
          rx={rx}
          fill={color}
          opacity={0.08}
        />
      ))}
    </svg>
  );
});

// Animated grid for loading state
const AnimatedGrid = memo(function AnimatedGrid({
  rows,
  cols,
  dotSize,
  gap,
  color,
  width,
  height,
}: {
  rows: number;
  cols: number;
  dotSize: number;
  gap: number;
  color: string;
  width: number;
  height: number;
}) {
  const [frame, setFrame] = useState(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const rx = dotSize / 3;

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (timestamp - lastTimeRef.current >= 100) {
        setFrame((prev) => (prev + 1) % 24);
        lastTimeRef.current = timestamp;
      }
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Pre-compute rect positions
  const gridData = useMemo(() => {
    const result: Array<{ x: number; y: number; row: number; col: number }> =
      [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        result.push({
          x: col * (dotSize + gap),
          y: row * (dotSize + gap),
          row,
          col,
        });
      }
    }
    return result;
  }, [rows, cols, dotSize, gap]);

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0"
    >
      {gridData.map(({ x, y, row, col }, i) => {
        const diagonalPosition = row + col;
        const wavePosition = (diagonalPosition + frame) % 16;
        let opacity: number;

        if (wavePosition < 4) {
          opacity = 0.08 + wavePosition * 0.1;
        } else if (wavePosition < 8) {
          opacity = 0.48 - (wavePosition - 4) * 0.1;
        } else {
          opacity = 0.06;
        }

        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={dotSize}
            height={dotSize}
            rx={rx}
            fill={color}
            opacity={opacity}
          />
        );
      })}
    </svg>
  );
});

const DottedToolbar = memo(function DottedToolbar({
  cols = 80,
  rows = 10,
  dotSize = 2,
  gap = 4,
  color,
  variant = "default",
  isLoading = false,
  className,
  children,
  ...props
}: DottedToolbarProps) {
  const { width, height, currentColor } = useMemo(
    () => ({
      width: cols * (dotSize + gap) - gap,
      height: rows * (dotSize + gap) - gap,
      currentColor:
        color ||
        (variant === "orange"
          ? "rgb(249, 115, 22)"
          : variant === "blue"
            ? "rgb(59, 130, 246)"
            : "rgb(113, 113, 122)"),
    }),
    [cols, rows, dotSize, gap, color, variant],
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden bg-background",
        "shadow-[0_0_0_1px_rgba(50,50,50,0.16),0_4px_8px_-0.5px_rgba(50,50,50,0.08),0_8px_16px_-2px_rgba(50,50,50,0.04)]",
        className,
      )}
      style={{ filter: "none" }}
      {...props}
    >
      {isLoading ? (
        <AnimatedGrid
          rows={rows}
          cols={cols}
          dotSize={dotSize}
          gap={gap}
          color={currentColor}
          width={width}
          height={height}
        />
      ) : (
        <StaticGrid
          rows={rows}
          cols={cols}
          dotSize={dotSize}
          gap={gap}
          color={currentColor}
          width={width}
          height={height}
        />
      )}
      {children && (
        <div className="relative z-10 h-full w-full flex items-center">
          {children}
        </div>
      )}
    </div>
  );
});

export { DottedToolbar };
export type { DottedToolbarProps };
