"use client";

import * as React from "react";
import { useState, useMemo, useCallback, memo } from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const dottedBadgeVariants = cva(
  "relative inline-flex items-center justify-center gap-2 transition-all duration-200",
  {
    variants: {
      variant: {
        default: "text-primary",
        orange: "text-orange-500",
        blue: "text-blue-500",
        green: "text-green-500",
        purple: "text-purple-500",
      },
      size: {
        sm: "py-1 px-2 text-xs",
        md: "py-1.5 px-3 text-sm",
        lg: "py-2 px-4 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

interface DottedBadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof dottedBadgeVariants> {
  /** Grid columns */
  cols?: number;
  /** Grid rows */
  rows?: number;
  /** Dot size in pixels */
  dotSize?: number;
  /** Gap between dots */
  gap?: number;
  /** Icon to display */
  icon?: React.ReactNode;
  /** Whether the badge is active */
  active?: boolean;
}

// Memoized grid component to avoid re-rendering on parent updates
const BadgeGrid = memo(function BadgeGrid({
  rows,
  cols,
  dotSize,
  gap,
  color,
  active,
  isHovered,
}: {
  rows: number;
  cols: number;
  dotSize: number;
  gap: number;
  color: string;
  active: boolean;
  isHovered: boolean;
}) {
  const width = cols * (dotSize + gap) - gap;
  const height = rows * (dotSize + gap) - gap;
  const rx = dotSize / 4;

  // Pre-compute pill shape parameters
  const centerX = (cols - 1) / 2;
  const centerY = (rows - 1) / 2;
  const endRadius = centerY;
  const leftCircleCenter = endRadius;
  const rightCircleCenter = cols - 1 - endRadius;

  // Memoize the grid path based on hover state
  const gridData = useMemo(() => {
    const rects: Array<{ x: number; y: number; opacity: number }> = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let normalizedDistance: number;

        if (col <= leftCircleCenter) {
          const dx = col - leftCircleCenter;
          const dy = row - centerY;
          normalizedDistance = Math.sqrt(dx * dx + dy * dy) / endRadius;
        } else if (col >= rightCircleCenter) {
          const dx = col - rightCircleCenter;
          const dy = row - centerY;
          normalizedDistance = Math.sqrt(dx * dx + dy * dy) / endRadius;
        } else {
          normalizedDistance = Math.abs(row - centerY) / endRadius;
        }

        if (normalizedDistance > 1.05) continue;

        let opacity: number;
        if (!active) {
          opacity = 0.03;
        } else {
          const isEdge =
            normalizedDistance > 0.85 && normalizedDistance <= 1.05;
          const isInner = normalizedDistance <= 0.85;

          if (isHovered) {
            if (isEdge) opacity = 0.6;
            else if (isInner) opacity = 0.25;
            else opacity = 0;
          } else {
            if (isEdge) opacity = 0.4;
            else if (isInner) opacity = 0.06;
            else opacity = 0;
          }
        }

        if (opacity > 0) {
          rects.push({
            x: col * (dotSize + gap),
            y: row * (dotSize + gap),
            opacity,
          });
        }
      }
    }

    return rects;
  }, [
    rows,
    cols,
    dotSize,
    gap,
    active,
    isHovered,
    centerX,
    centerY,
    endRadius,
    leftCircleCenter,
    rightCircleCenter,
  ]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="absolute inset-0"
      style={{ minWidth: width, minHeight: height }}
    >
      {gridData.map(({ x, y, opacity }, i) => (
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
      ))}
    </svg>
  );
});

const DottedBadge = memo(function DottedBadge({
  className,
  variant,
  size,
  cols = 24,
  rows = 6,
  dotSize = 2,
  gap = 3,
  icon,
  active = true,
  children,
  ...props
}: DottedBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const color = useMemo(() => {
    switch (variant) {
      case "orange":
        return "rgb(249, 115, 22)";
      case "blue":
        return "rgb(59, 130, 246)";
      case "green":
        return "rgb(34, 197, 94)";
      case "purple":
        return "rgb(168, 85, 247)";
      default:
        return "rgb(59, 130, 246)";
    }
  }, [variant]);

  return (
    <div
      className={cn(
        "isolate",
        dottedBadgeVariants({ variant, size, className }),
      )}
      style={{ filter: "none" }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      {...props}
    >
      <BadgeGrid
        rows={rows}
        cols={cols}
        dotSize={dotSize}
        gap={gap}
        color={color}
        active={active}
        isHovered={isHovered}
      />
      <div className="relative z-10 flex items-center gap-2 font-medium">
        {icon && <span className="shrink-0">{icon}</span>}
        {children}
      </div>
    </div>
  );
});

export { DottedBadge, dottedBadgeVariants };
export type { DottedBadgeProps };
