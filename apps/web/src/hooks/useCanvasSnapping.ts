import { useCallback, useState } from "react";
import type { PlacedImage, PlacedVideo } from "@/types/canvas";

interface SnapGuide {
  lineGuide: number;
  offset: number;
  orientation: "V" | "H";
  snap: "start" | "center" | "end";
  snapTo?: { x: number; y: number; width: number; height: number }; // The object we're snapping to
  snapFrom?: { x: number; y: number; width: number; height: number }; // The object being dragged
}

interface SnappingEdge {
  guide: number;
  offset: number;
  snap: "start" | "center" | "end";
}

interface SnappingResult {
  guides: SnapGuide[];
  snappedX?: number;
  snappedY?: number;
}

const GUIDELINE_OFFSET = 5; // Snap when within 5 pixels in world coordinates

export function useCanvasSnapping(
  images: PlacedImage[],
  videos: PlacedVideo[],
  canvasSize: { width: number; height: number },
  viewport: { x: number; y: number; scale: number },
) {
  const [guideLines, setGuideLines] = useState<SnapGuide[]>([]);

  // Get all possible snap points (stage edges, centers, and object edges/centers)
  const getLineGuideStops = useCallback(
    (
      skipId: string,
    ): {
      vertical: Array<{ guide: number; obj?: PlacedImage | PlacedVideo }>;
      horizontal: Array<{ guide: number; obj?: PlacedImage | PlacedVideo }>;
    } => {
      // Start with stage borders and center (in world coordinates)
      const vertical: Array<{
        guide: number;
        obj?: PlacedImage | PlacedVideo;
      }> = [
        { guide: 0, obj: undefined },
        { guide: canvasSize.width / 2, obj: undefined },
        { guide: canvasSize.width, obj: undefined },
      ];
      const horizontal: Array<{
        guide: number;
        obj?: PlacedImage | PlacedVideo;
      }> = [
        { guide: 0, obj: undefined },
        { guide: canvasSize.height / 2, obj: undefined },
        { guide: canvasSize.height, obj: undefined },
      ];

      // Add edges and centers of all objects except the one being dragged
      const allObjects = [...images, ...videos].filter(
        (obj) => obj.id !== skipId,
      );

      allObjects.forEach((obj) => {
        // Left edge, center, right edge
        vertical.push(
          { guide: obj.x, obj: obj },
          { guide: obj.x + obj.width / 2, obj: obj },
          { guide: obj.x + obj.width, obj: obj },
        );
        // Top edge, center, bottom edge
        horizontal.push(
          { guide: obj.y, obj: obj },
          { guide: obj.y + obj.height / 2, obj: obj },
          { guide: obj.y + obj.height, obj: obj },
        );
      });

      return {
        vertical,
        horizontal,
      };
    },
    [images, videos, canvasSize, viewport],
  );

  // Get snapping edges for the object being dragged
  const getObjectSnappingEdges = useCallback(
    (
      obj: PlacedImage | PlacedVideo,
    ): { vertical: SnappingEdge[]; horizontal: SnappingEdge[] } => {
      return {
        vertical: [
          {
            guide: Math.round(obj.x),
            offset: 0,
            snap: "start",
          },
          {
            guide: Math.round(obj.x + obj.width / 2),
            offset: Math.round(-obj.width / 2),
            snap: "center",
          },
          {
            guide: Math.round(obj.x + obj.width),
            offset: Math.round(-obj.width),
            snap: "end",
          },
        ],
        horizontal: [
          {
            guide: Math.round(obj.y),
            offset: 0,
            snap: "start",
          },
          {
            guide: Math.round(obj.y + obj.height / 2),
            offset: Math.round(-obj.height / 2),
            snap: "center",
          },
          {
            guide: Math.round(obj.y + obj.height),
            offset: Math.round(-obj.height),
            snap: "end",
          },
        ],
      };
    },
    [],
  );

  // Find the closest snapping guides
  const getGuides = useCallback(
    (
      lineGuideStops: {
        vertical: Array<{ guide: number; obj?: PlacedImage | PlacedVideo }>;
        horizontal: Array<{ guide: number; obj?: PlacedImage | PlacedVideo }>;
      },
      itemBounds: { vertical: SnappingEdge[]; horizontal: SnappingEdge[] },
      draggedObj: PlacedImage | PlacedVideo,
    ): SnapGuide[] => {
      const resultV: Array<
        SnapGuide & {
          diff: number;
          snapTo?: PlacedImage | PlacedVideo;
        }
      > = [];
      const resultH: Array<
        SnapGuide & {
          diff: number;
          snapTo?: PlacedImage | PlacedVideo;
        }
      > = [];

      // Scale the guideline offset based on viewport scale
      // When zoomed out (scale < 1), increase threshold in world coordinates
      // When zoomed in (scale > 1), decrease threshold
      const scaledOffset = GUIDELINE_OFFSET / viewport.scale;

      lineGuideStops.vertical.forEach((lineGuideStop) => {
        itemBounds.vertical.forEach((itemBound) => {
          const diff = Math.abs(lineGuideStop.guide - itemBound.guide);
          if (diff < scaledOffset) {
            resultV.push({
              lineGuide: lineGuideStop.guide,
              diff: diff,
              snap: itemBound.snap,
              offset: itemBound.offset,
              orientation: "V",
              snapTo: lineGuideStop.obj,
            });
          }
        });
      });

      lineGuideStops.horizontal.forEach((lineGuideStop) => {
        itemBounds.horizontal.forEach((itemBound) => {
          const diff = Math.abs(lineGuideStop.guide - itemBound.guide);
          if (diff < scaledOffset) {
            resultH.push({
              lineGuide: lineGuideStop.guide,
              diff: diff,
              snap: itemBound.snap,
              offset: itemBound.offset,
              orientation: "H",
              snapTo: lineGuideStop.obj,
            });
          }
        });
      });

      const guides: SnapGuide[] = [];

      // Find closest vertical snap
      const minV = resultV.sort((a, b) => a.diff - b.diff)[0];
      if (minV) {
        guides.push({
          lineGuide: minV.lineGuide,
          offset: minV.offset,
          orientation: "V",
          snap: minV.snap,
          snapTo: minV.snapTo
            ? {
                x: minV.snapTo.x,
                y: minV.snapTo.y,
                width: minV.snapTo.width,
                height: minV.snapTo.height,
              }
            : undefined,
          snapFrom: {
            x: draggedObj.x,
            y: draggedObj.y,
            width: draggedObj.width,
            height: draggedObj.height,
          },
        });
      }

      // Find closest horizontal snap
      const minH = resultH.sort((a, b) => a.diff - b.diff)[0];
      if (minH) {
        guides.push({
          lineGuide: minH.lineGuide,
          offset: minH.offset,
          orientation: "H",
          snap: minH.snap,
          snapTo: minH.snapTo
            ? {
                x: minH.snapTo.x,
                y: minH.snapTo.y,
                width: minH.snapTo.width,
                height: minH.snapTo.height,
              }
            : undefined,
          snapFrom: {
            x: draggedObj.x,
            y: draggedObj.y,
            width: draggedObj.width,
            height: draggedObj.height,
          },
        });
      }

      return guides;
    },
    [viewport.scale],
  );

  // Calculate snapping for an object during drag
  const getSnapping = useCallback(
    (obj: PlacedImage | PlacedVideo): SnappingResult => {
      const lineGuideStops = getLineGuideStops(obj.id);
      const itemBounds = getObjectSnappingEdges(obj);
      const guides = getGuides(lineGuideStops, itemBounds, obj);

      if (!guides.length) {
        return { guides: [] };
      }

      let snappedX = obj.x;
      let snappedY = obj.y;

      guides.forEach((guide) => {
        if (guide.orientation === "V") {
          snappedX = guide.lineGuide + guide.offset;
        } else if (guide.orientation === "H") {
          snappedY = guide.lineGuide + guide.offset;
        }
      });

      return { guides, snappedX, snappedY };
    },
    [getLineGuideStops, getObjectSnappingEdges, getGuides],
  );

  // Update guide lines
  const updateGuideLines = useCallback((guides: SnapGuide[]) => {
    setGuideLines(guides);
  }, []);

  // Clear guide lines
  const clearGuideLines = useCallback(() => {
    setGuideLines([]);
  }, []);

  return {
    guideLines,
    getSnapping,
    updateGuideLines,
    clearGuideLines,
  };
}
