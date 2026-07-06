"use client";

import * as React from "react";
import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { cn } from "@/lib/utils";

type LoaderState = "idle" | "submitting" | "running" | "success" | "error";

interface DottedLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Current loading state */
  state?: LoaderState;
  /** Grid columns */
  cols?: number;
  /** Grid rows */
  rows?: number;
  /** Dot size in pixels */
  dotSize?: number;
  /** Gap between dots */
  gap?: number;
  /** Primary color */
  color?: string;
  /** Success color */
  successColor?: string;
  /** Error color */
  errorColor?: string;
}

// Pre-compute grid positions
function generateGridPositions(
  rows: number,
  cols: number,
  dotSize: number,
  gap: number,
) {
  const positions: Array<{ row: number; col: number; x: number; y: number }> =
    [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      positions.push({
        row,
        col,
        x: col * (dotSize + gap),
        y: row * (dotSize + gap),
      });
    }
  }
  return positions;
}

const DottedLoader = memo(function DottedLoader({
  state = "idle",
  cols = 16,
  rows = 4,
  dotSize = 3,
  gap = 4,
  color = "rgb(59, 130, 246)", // blue-500
  successColor = "rgb(34, 197, 94)", // green-500
  errorColor = "rgb(239, 68, 68)", // red-500
  className,
  ...props
}: DottedLoaderProps) {
  const [frame, setFrame] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);

  // Use requestAnimationFrame for smoother animations
  useEffect(() => {
    if (state === "idle") return;

    const intervals: Record<LoaderState, number> = {
      idle: 0,
      submitting: 100,
      running: 150,
      success: 60,
      error: 120,
    };

    const interval = intervals[state];

    const animate = (timestamp: number) => {
      if (timestamp - lastTimeRef.current >= interval) {
        setFrame((prev) => (prev + 1) % 20);
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
  }, [state]);

  // Memoize grid dimensions
  const { width, height, gridPositions, rx } = useMemo(
    () => ({
      width: cols * (dotSize + gap) - gap,
      height: rows * (dotSize + gap) - gap,
      gridPositions: generateGridPositions(rows, cols, dotSize, gap),
      rx: dotSize / 4,
    }),
    [cols, rows, dotSize, gap],
  );

  // Memoize color getter
  const currentColor = useMemo(() => {
    if (state === "success") return successColor;
    if (state === "error") return errorColor;
    return color;
  }, [state, color, successColor, errorColor]);

  // Memoize opacity calculation function
  const getOpacity = useCallback(
    (row: number, col: number): number => {
      const centerX = (cols - 1) / 2;
      const centerY = (rows - 1) / 2;

      // Normalized positions (0-1)
      const normalizedX = col / (cols - 1);
      const normalizedY = row / (rows - 1);

      // Edge detection
      const isTopEdge = row === 0;
      const isBottomEdge = row === rows - 1;
      const isLeftEdge = col === 0;
      const isRightEdge = col === cols - 1;
      const isEdge = isTopEdge || isBottomEdge || isLeftEdge || isRightEdge;

      // Center zone detection (middle third)
      const isCenterX = normalizedX > 0.35 && normalizedX < 0.65;
      const isCenterY = normalizedY > 0.25 && normalizedY < 0.75;
      const isCenter = isCenterX && isCenterY;

      // Corner detection
      const isCorner =
        (isTopEdge || isBottomEdge) && (isLeftEdge || isRightEdge);

      // Side centers (not corners)
      const isSideCenter = isEdge && !isCorner && (isCenterX || isCenterY);

      switch (state) {
        case "idle":
          return 0.08;

        case "submitting": {
          const diagonalPosition = row + col;
          const wavePosition = (diagonalPosition + frame) % 12;
          if (wavePosition < 3) {
            return 0.15 + wavePosition * 0.2;
          } else if (wavePosition < 6) {
            return 0.75 - (wavePosition - 3) * 0.2;
          }
          return 0.08;
        }

        case "running": {
          const patternPhase = frame % 20;

          if (patternPhase < 4) {
            return 0.08;
          } else if (patternPhase < 8) {
            if (isCenter) {
              const pulse = Math.sin(((patternPhase - 4) * Math.PI) / 4);
              return 0.4 + pulse * 0.4;
            }
            return 0.08;
          } else if (patternPhase < 12) {
            if (isCorner) return 0.8;
            return 0.08;
          } else if (patternPhase < 16) {
            if (isSideCenter) return 0.8;
            return 0.08;
          } else {
            if (isEdge) return 0.7;
            return 0.08;
          }
        }

        case "success": {
          const manhattanDistance =
            Math.abs(row - centerY) + Math.abs(col - centerX);
          const maxManhattan = centerX + centerY;
          const expansionProgress = (frame % 16) / 16;
          const threshold = expansionProgress * maxManhattan * 1.5;

          if (manhattanDistance <= threshold) {
            return Math.max(
              0.3,
              1 - ((threshold - manhattanDistance) / maxManhattan) * 0.5,
            );
          }
          return 0.08;
        }

        case "error": {
          const flashPhase = frame % 8;
          if (flashPhase < 4) {
            return isEdge ? 0.8 : 0.5;
          }
          return 0.15;
        }

        default:
          return 0.08;
      }
    },
    [state, frame, cols, rows],
  );

  if (state === "idle") return null;

  return (
    <div
      className={cn(
        "relative flex items-center justify-center isolate",
        className,
      )}
      style={{ filter: "none" }}
      {...props}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {gridPositions.map(({ row, col, x, y }) => (
          <rect
            key={`${row}-${col}`}
            x={x}
            y={y}
            width={dotSize}
            height={dotSize}
            rx={rx}
            fill={currentColor}
            opacity={getOpacity(row, col)}
          />
        ))}
      </svg>
    </div>
  );
});

export { DottedLoader };
export type { DottedLoaderProps, LoaderState };
