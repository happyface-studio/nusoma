"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DottedContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Dot size for the pixelation effect */
  dotSize?: number;
  /** Color of the dots */
  color?: string;
}

function DottedContent({
  dotSize = 2,
  color,
  className,
  children,
  style,
  ...props
}: DottedContentProps) {
  const filterId = React.useId().replace(/:/g, "");

  return (
    <div
      className={cn("relative", className)}
      style={{
        ...style,
        filter: `url(#dotMatrix-${filterId})`,
      }}
      {...props}
    >
      {children}

      {/* SVG filter for dot matrix effect */}
      <svg
        style={{
          position: "absolute",
          width: 0,
          height: 0,
          pointerEvents: "none",
        }}
      >
        <defs>
          <filter
            id={`dotMatrix-${filterId}`}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            {/* Create pixelation effect */}
            <feFlood floodColor={color || "currentColor"} result="color" />
            <feComposite
              in="color"
              in2="SourceAlpha"
              operator="in"
              result="coloredSource"
            />

            {/* Pixelate by scaling down and up */}
            <feImage
              href={`data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${dotSize}' height='${dotSize}'%3E%3Crect width='${Math.max(1, dotSize - 1)}' height='${Math.max(1, dotSize - 1)}' fill='white'/%3E%3C/svg%3E`}
              result="dot"
            />
            <feTile in="dot" result="dots" />
            <feComposite in="coloredSource" in2="dots" operator="in" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

export { DottedContent };
export type { DottedContentProps };
