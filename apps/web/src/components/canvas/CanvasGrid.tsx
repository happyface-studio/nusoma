import React from "react";
import { Shape } from "react-konva";
import { useTheme } from "next-themes";

interface CanvasGridProps {
  viewport: {
    x: number;
    y: number;
    scale: number;
  };
  canvasSize: {
    width: number;
    height: number;
  };
  gridSize?: number;
  gridColor?: string;
}

// One Shape drawing all grid lines in a single path. Rendering each line as
// its own <Line> node meant hundreds of React elements reconciled and drawn
// (scene + hit canvas) on every pan/zoom frame. listening={false} also keeps
// the grid out of hit detection so clicks on lines still reach the stage.
export const CanvasGrid: React.FC<CanvasGridProps> = ({
  viewport,
  canvasSize,
  gridSize = 50,
  gridColor,
}) => {
  const { resolvedTheme } = useTheme();

  // Set grid color based on theme
  const effectiveGridColor =
    gridColor || (resolvedTheme === "dark" ? "#222222" : "#F2F2F2");

  // Calculate visible area in canvas coordinates
  const startX = Math.floor(-viewport.x / viewport.scale / gridSize) * gridSize;
  const startY = Math.floor(-viewport.y / viewport.scale / gridSize) * gridSize;
  const endX =
    Math.ceil((canvasSize.width - viewport.x) / viewport.scale / gridSize) *
    gridSize;
  const endY =
    Math.ceil((canvasSize.height - viewport.y) / viewport.scale / gridSize) *
    gridSize;

  return (
    <Shape
      listening={false}
      stroke={effectiveGridColor}
      strokeWidth={1}
      sceneFunc={(ctx, shape) => {
        ctx.beginPath();
        for (let x = startX; x <= endX; x += gridSize) {
          ctx.moveTo(x, startY);
          ctx.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += gridSize) {
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
        }
        ctx.fillStrokeShape(shape);
      }}
    />
  );
};
