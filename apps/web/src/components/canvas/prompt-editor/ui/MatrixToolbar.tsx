import React, { memo } from "react";
import { Matrix, pulse, wave } from "@/components/ui/matrix";
import type { GenerationState } from "@/types/canvas";
import {
  type GenerationType,
  getGenerationTypeColor,
  getGenerationModeForContext,
} from "@/lib/generation-types";
import { type CommonSizeOption } from "@/types/models";

// Matrix toolbar constants
const MATRIX_ROWS = 10;
const MATRIX_COLS = 90;
const MATRIX_DOT_SIZE = 2;
const MATRIX_GAP = 2;

// Pre-computed background pattern (static, no need for useMemo)
const BACKGROUND_PATTERN: number[][] = Array.from({ length: MATRIX_ROWS }, () =>
  new Array(MATRIX_COLS).fill(0),
);

// Full-width Matrix toolbar background with content overlay
export const MatrixToolbar = memo(function MatrixToolbar({
  isGenerating,
  state,
  generationType,
  hasInputAsset,
  sizeOption,
}: {
  isGenerating: boolean;
  state: GenerationState;
  generationType: GenerationType;
  hasInputAsset: boolean;
  sizeOption: CommonSizeOption;
}) {
  // Get the current generation mode based on context
  const currentMode = getGenerationModeForContext(
    generationType,
    hasInputAsset,
    hasInputAsset ? "image" : undefined, // For now, assume image input
  );

  const statusText = isGenerating
    ? state === "submitting"
      ? "Submitting..."
      : state === "success"
        ? "Complete!"
        : "Generating..."
    : currentMode?.shortLabel || "Generate";

  const color =
    state === "success" && isGenerating
      ? "rgb(34, 197, 94)" // green-500
      : getGenerationTypeColor(generationType);

  const toolbarWidth =
    MATRIX_COLS * (MATRIX_DOT_SIZE + MATRIX_GAP) - MATRIX_GAP;
  const toolbarHeight =
    MATRIX_ROWS * (MATRIX_DOT_SIZE + MATRIX_GAP) - MATRIX_GAP;

  return (
    <div
      className="relative w-full flex items-center px-10 justify-between"
      style={{
        height: toolbarHeight,
        minWidth: toolbarWidth,
      }}
    >
      {/* Background Matrix - spans full width */}
      <Matrix
        rows={MATRIX_ROWS}
        cols={MATRIX_COLS}
        pattern={BACKGROUND_PATTERN}
        size={MATRIX_DOT_SIZE}
        gap={MATRIX_GAP}
        palette={{ on: color, off: "var(--muted-foreground)" }}
        brightness={1}
        className="absolute inset-0 m-auto"
      />

      {/* Left: Status content */}
      <div className="relative z-10 flex items-center gap-4">
        {/* Animated icon */}
        {isGenerating && (
          <Matrix
            rows={7}
            cols={7}
            frames={state === "success" ? pulse : wave}
            fps={isGenerating ? (state === "success" ? 16 : 12) : 10}
            autoplay
            loop
            size={MATRIX_DOT_SIZE}
            gap={MATRIX_GAP}
            palette={{ on: color, off: "transparent" }}
            brightness={1}
          />
        )}

        {/* Text label */}
        <span
          className="font-extrabold font-dotted tracking-wide"
          style={{ color }}
        >
          {statusText}
        </span>
      </div>

      {/* Right: Size display */}
      <div className="relative z-10 flex items-center gap-2">
        <span
          className="font-extrabold font-dotted tracking-wide tabular-nums"
          style={{ color }}
        >
          {sizeOption.ratio}
        </span>
      </div>
    </div>
  );
});
