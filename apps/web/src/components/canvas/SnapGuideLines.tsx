import React from "react";
import { Line } from "react-konva";

interface SnapGuide {
  lineGuide: number;
  offset: number;
  orientation: "V" | "H";
  snap: "start" | "center" | "end";
  snapTo?: { x: number; y: number; width: number; height: number };
  snapFrom?: { x: number; y: number; width: number; height: number };
}

interface SnapGuideLinesProps {
  guides: SnapGuide[];
}

export const SnapGuideLines: React.FC<SnapGuideLinesProps> = ({ guides }) => {
  const xSize = 2; // Size of the X marker

  return (
    <>
      {guides.map((guide, index) => {
        if (guide.orientation === "H") {
          // Horizontal line - calculate bounds based on snapping objects
          let x1 = -6000;
          let x2 = 6000;

          if (guide.snapFrom && guide.snapTo) {
            // Line should span from the leftmost to rightmost edge of both objects
            x1 = Math.min(guide.snapFrom.x, guide.snapTo.x);
            x2 = Math.max(
              guide.snapFrom.x + guide.snapFrom.width,
              guide.snapTo.x + guide.snapTo.width,
            );
          } else if (guide.snapFrom) {
            // Snapping to canvas edge - extend from object edge outward
            x1 = guide.snapFrom.x;
            x2 = guide.snapFrom.x + guide.snapFrom.width;
          }

          // Calculate X marker position at the snap point
          const y = guide.lineGuide;
          let snapX = (x1 + x2) / 2; // default to center if no snapFrom

          if (guide.snapFrom) {
            // Position X at the snapping edge of the dragged object
            if (guide.snap === "start") {
              snapX = guide.snapFrom.x; // Left edge
            } else if (guide.snap === "center") {
              snapX = guide.snapFrom.x + guide.snapFrom.width / 2; // Horizontal center
            } else if (guide.snap === "end") {
              snapX = guide.snapFrom.x + guide.snapFrom.width; // Right edge
            }
          }

          return (
            <React.Fragment key={`guide-h-${index}`}>
              <Line
                points={[x1, guide.lineGuide, x2, guide.lineGuide]}
                stroke="rgb(0, 161, 255)"
                strokeWidth={0.5}
                listening={false}
              />
              {/* X marker at snap point */}
              <Line
                points={[snapX - xSize, y - xSize, snapX + xSize, y + xSize]}
                stroke="rgb(0, 161, 255)"
                strokeWidth={1}
                listening={false}
              />
              <Line
                points={[snapX + xSize, y - xSize, snapX - xSize, y + xSize]}
                stroke="rgb(0, 161, 255)"
                strokeWidth={1}
                listening={false}
              />
            </React.Fragment>
          );
        } else {
          // Vertical line - calculate bounds based on snapping objects
          let y1 = -6000;
          let y2 = 6000;

          if (guide.snapFrom && guide.snapTo) {
            // Line should span from the topmost to bottommost edge of both objects
            y1 = Math.min(guide.snapFrom.y, guide.snapTo.y);
            y2 = Math.max(
              guide.snapFrom.y + guide.snapFrom.height,
              guide.snapTo.y + guide.snapTo.height,
            );
          } else if (guide.snapFrom) {
            // Snapping to canvas edge - extend from object edge outward
            y1 = guide.snapFrom.y;
            y2 = guide.snapFrom.y + guide.snapFrom.height;
          }

          // Calculate X marker position at the snap point
          const x = guide.lineGuide;
          let snapY = (y1 + y2) / 2; // default to center if no snapFrom

          if (guide.snapFrom) {
            // Position X at the snapping edge of the dragged object
            if (guide.snap === "start") {
              snapY = guide.snapFrom.y; // Top edge
            } else if (guide.snap === "center") {
              snapY = guide.snapFrom.y + guide.snapFrom.height / 2; // Vertical center
            } else if (guide.snap === "end") {
              snapY = guide.snapFrom.y + guide.snapFrom.height; // Bottom edge
            }
          }

          return (
            <React.Fragment key={`guide-v-${index}`}>
              <Line
                points={[guide.lineGuide, y1, guide.lineGuide, y2]}
                stroke="rgb(0, 161, 255)"
                strokeWidth={0.5}
                listening={false}
              />
              {/* X marker at snap point */}
              <Line
                points={[x - xSize, snapY - xSize, x + xSize, snapY + xSize]}
                stroke="rgb(0, 161, 255)"
                strokeWidth={1}
                listening={false}
              />
              <Line
                points={[x + xSize, snapY - xSize, x - xSize, snapY + xSize]}
                stroke="rgb(0, 161, 255)"
                strokeWidth={1}
                listening={false}
              />
            </React.Fragment>
          );
        }
      })}
    </>
  );
};
