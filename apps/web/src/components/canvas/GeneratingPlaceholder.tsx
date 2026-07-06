import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  memo,
  useCallback,
} from "react";
import { Group, Rect } from "react-konva";
import { Html } from "react-konva-utils";
import type { PlacedImage } from "@/types/canvas";

export type PlaceholderState = "submitting" | "running" | "success";

interface GeneratingPlaceholderProps {
  image: PlacedImage;
  outputType: "image" | "video";
  state?: PlaceholderState;
}

// Icon patterns for content types (simple dot matrix icons)
const imageIconPattern = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 1, 0, 0, 1, 0],
  [0, 1, 0, 0, 0, 1, 1, 0],
  [0, 1, 0, 0, 1, 0, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

const videoIconPattern = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0],
  [0, 1, 0, 1, 1, 0, 1, 0],
  [0, 1, 0, 1, 1, 0, 1, 0],
  [0, 1, 0, 0, 0, 0, 1, 0],
  [0, 1, 1, 1, 1, 1, 1, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
];

interface DottedPlaceholderGridProps {
  width: number;
  height: number;
  state: PlaceholderState;
  outputType: "image" | "video";
  color: string;
  successColor: string;
}

const DottedPlaceholderGrid = memo(function DottedPlaceholderGrid({
  width,
  height,
  state,
  outputType,
  color,
  successColor,
}: DottedPlaceholderGridProps) {
  const [frame, setFrame] = useState(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Memoize grid dimensions
  const gridConfig = useMemo(() => {
    const dotSize = Math.max(
      2,
      Math.min(4, Math.floor(Math.min(width, height) / 80)),
    );
    const gap = dotSize * 2;
    const cols = Math.floor(width / (dotSize + gap));
    const rows = Math.floor(height / (dotSize + gap));
    const iconSize = 8;
    const iconScale = Math.max(1, Math.floor(Math.min(cols, rows) / 16));
    const iconCols = iconSize * iconScale;
    const iconRows = iconSize * iconScale;
    const iconStartCol = Math.floor((cols - iconCols) / 2);
    const iconStartRow = Math.floor((rows - iconRows) / 2);
    const gridWidth = cols * (dotSize + gap) - gap;
    const gridHeight = rows * (dotSize + gap) - gap;
    const centerX = (cols - 1) / 2;
    const centerY = (rows - 1) / 2;

    return {
      dotSize,
      gap,
      cols,
      rows,
      iconScale,
      iconCols,
      iconRows,
      iconStartCol,
      iconStartRow,
      gridWidth,
      gridHeight,
      centerX,
      centerY,
      rx: dotSize / 3,
    };
  }, [width, height]);

  const iconPattern =
    outputType === "video" ? videoIconPattern : imageIconPattern;

  // Use requestAnimationFrame for smoother animations
  useEffect(() => {
    const intervals: Record<PlaceholderState, number> = {
      submitting: 100,
      running: 150,
      success: 60,
    };

    const interval = intervals[state];

    const animate = (timestamp: number) => {
      if (timestamp - lastTimeRef.current >= interval) {
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
  }, [state]);

  const currentColor = state === "success" ? successColor : color;

  // Pre-compute grid positions once
  const gridPositions = useMemo(() => {
    const {
      cols,
      rows,
      dotSize,
      gap,
      iconStartRow,
      iconStartCol,
      iconCols,
      iconRows,
      iconScale,
    } = gridConfig;
    const positions: Array<{
      x: number;
      y: number;
      row: number;
      col: number;
      isIcon: boolean;
      isEdge: boolean;
      isCorner: boolean;
    }> = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const isTopEdge = row === 0;
        const isBottomEdge = row === rows - 1;
        const isLeftEdge = col === 0;
        const isRightEdge = col === cols - 1;
        const isEdge = isTopEdge || isBottomEdge || isLeftEdge || isRightEdge;
        const isCorner =
          (isTopEdge || isBottomEdge) && (isLeftEdge || isRightEdge);

        // Check if icon dot
        let isIcon = false;
        if (
          row >= iconStartRow &&
          row < iconStartRow + iconRows &&
          col >= iconStartCol &&
          col < iconStartCol + iconCols
        ) {
          const iconRow = Math.floor((row - iconStartRow) / iconScale);
          const iconCol = Math.floor((col - iconStartCol) / iconScale);
          isIcon = iconPattern[iconRow]?.[iconCol] === 1;
        }

        positions.push({
          x: col * (dotSize + gap),
          y: row * (dotSize + gap),
          row,
          col,
          isIcon,
          isEdge,
          isCorner,
        });
      }
    }

    return positions;
  }, [gridConfig, iconPattern]);

  // Calculate opacities based on frame and state
  const rects = useMemo(() => {
    const { centerX, centerY } = gridConfig;

    return gridPositions.map((pos) => {
      const { row, col, isIcon, isEdge, isCorner } = pos;
      let opacity: number;

      switch (state) {
        case "submitting": {
          const diagonalPosition = row + col;
          const wavePosition = (diagonalPosition + frame) % 16;

          if (isIcon) {
            opacity = Math.sin(frame * 0.3) * 0.3 + 0.7;
          } else if (wavePosition < 4) {
            opacity = 0.06 + wavePosition * 0.08;
          } else if (wavePosition < 8) {
            opacity = 0.38 - (wavePosition - 4) * 0.08;
          } else {
            opacity = 0.04;
          }
          break;
        }

        case "running": {
          const patternPhase = frame % 20;

          if (isIcon) {
            opacity = Math.sin(frame * 0.2) * 0.2 + 0.8;
          } else if (patternPhase < 5) {
            opacity = isEdge ? 0.15 : 0.04;
          } else if (patternPhase < 10) {
            opacity = isCorner ? 0.6 : isEdge ? 0.1 : 0.03;
          } else if (patternPhase < 15) {
            opacity = isEdge ? 0.4 : 0.03;
          } else {
            opacity = isEdge ? 0.5 : 0.05;
          }
          break;
        }

        case "success": {
          const manhattanDistance =
            Math.abs(row - centerY) + Math.abs(col - centerX);
          const maxManhattan = centerX + centerY;
          const expansionProgress = (frame % 16) / 16;
          const threshold = expansionProgress * maxManhattan * 1.5;

          if (isIcon) {
            opacity = 1;
          } else if (manhattanDistance <= threshold) {
            opacity = Math.max(
              0.3,
              1 - ((threshold - manhattanDistance) / maxManhattan) * 0.5,
            );
          } else {
            opacity = 0.05;
          }
          break;
        }

        default:
          opacity = isIcon ? 0.8 : 0.05;
      }

      return { ...pos, opacity };
    });
  }, [gridPositions, gridConfig, state, frame]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${gridConfig.gridWidth} ${gridConfig.gridHeight}`}
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0 }}
    >
      {rects.map(({ x, y, opacity }, i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={gridConfig.dotSize}
          height={gridConfig.dotSize}
          rx={gridConfig.rx}
          fill={currentColor}
          opacity={opacity}
        />
      ))}
    </svg>
  );
});

export function GeneratingPlaceholder({
  image,
  outputType,
  state = "running",
}: GeneratingPlaceholderProps) {
  const color = "#335CFF";
  const successColor = "#22c55e"; // green-500

  // Determine colors based on state
  const strokeColor = state === "success" ? successColor : color;
  const fillColor =
    state === "success" ? "rgba(34, 197, 94, 0.08)" : "rgba(51, 92, 225, 0.08)";

  return (
    <Group x={image.x} y={image.y}>
      {/* Background frame with dashed border */}
      <Rect
        width={image.width}
        height={image.height}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
        dash={state === "success" ? undefined : [10, 5]}
      />

      {/* Dotted grid with icon */}
      <Html
        groupProps={{
          x: 0,
          y: 0,
        }}
        divProps={{
          style: {
            width: `${image.width}px`,
            height: `${image.height}px`,
            pointerEvents: "none",
            overflow: "hidden",
          },
        }}
      >
        <div style={{ width: "100%", height: "100%", position: "relative" }}>
          <DottedPlaceholderGrid
            width={image.width}
            height={image.height}
            state={state}
            outputType={outputType}
            color={color}
            successColor={successColor}
          />
        </div>
      </Html>
    </Group>
  );
}
