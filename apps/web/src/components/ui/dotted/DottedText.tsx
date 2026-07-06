"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DottedTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Text to render */
  text: string;
  /** Font size in pixels */
  size?: number;
  /** Font weight */
  weight?: 400 | 500 | 600 | 700 | 800;
  /** Color of the text */
  color?: string;
  /** Letter spacing */
  letterSpacing?: string;
}

/**
 * DottedText - Renders text using the Doto dotted font
 *
 * Uses Google's Doto font which is designed as a dotted display font.
 * Much simpler and cleaner than canvas rasterization.
 */
function DottedText({
  text,
  size = 14,
  weight = 500,
  color = "currentColor",
  letterSpacing = "0.02em",
  className,
  style,
  ...props
}: DottedTextProps) {
  return (
    <span
      className={cn("font-dotted inline-block", className)}
      style={{
        fontSize: size,
        fontWeight: weight,
        color,
        letterSpacing,
        lineHeight: 1.2,
        ...style,
      }}
      {...props}
    >
      {text}
    </span>
  );
}

export { DottedText };
export type { DottedTextProps };
