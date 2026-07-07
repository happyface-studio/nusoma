import React from "react";
import type { PlacedImage, PlacedVideo } from "@/types/canvas";
import type { useCanvasSnapping } from "@/hooks/useCanvasSnapping";

// Pure: move every OTHER selected item by the dragged item's delta, anchored at
// each item's drag-start position. The dragged item itself is not moved here
// (Konva moves it); items lacking a recorded start position are left untouched.
export function applyDragDelta<T extends { id: string; x: number; y: number }>(
  items: T[],
  selectedIds: string[],
  draggedId: string,
  delta: { x: number; y: number },
  startPositions: Map<string, { x: number; y: number }>,
): T[] {
  return items.map((item) => {
    if (selectedIds.includes(item.id) && item.id !== draggedId) {
      const startPos = startPositions.get(item.id);
      if (startPos) {
        return { ...item, x: startPos.x + delta.x, y: startPos.y + delta.y };
      }
    }
    return item;
  });
}

// Builds the onDragMove/onDragStart/onDragEnd trio for canvas elements, deduping
// the near-identical image and video inline handlers. Behaviour is preserved
// exactly: onDragMove returns the (possibly snapped) attrs so the Konva node
// updates; multi-select drags move the whole selection; videos additionally
// hide their controls for the duration of the drag.
export function useSnapDragHandlers(opts: {
  getSnapping: ReturnType<typeof useCanvasSnapping>["getSnapping"];
  updateGuideLines: ReturnType<typeof useCanvasSnapping>["updateGuideLines"];
  clearGuideLines: ReturnType<typeof useCanvasSnapping>["clearGuideLines"];
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  images: PlacedImage[];
  videos: PlacedVideo[];
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  setVideos: React.Dispatch<React.SetStateAction<PlacedVideo[]>>;
  dragStartPositions: Map<string, { x: number; y: number }>;
  setDragStartPositions: React.Dispatch<
    React.SetStateAction<Map<string, { x: number; y: number }>>
  >;
  setIsDraggingImage: React.Dispatch<React.SetStateAction<boolean>>;
  setHiddenVideoControlsIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  saveToHistory: () => void;
}) {
  const {
    getSnapping,
    updateGuideLines,
    clearGuideLines,
    selectedIds,
    setSelectedIds,
    images,
    videos,
    setImages,
    setVideos,
    dragStartPositions,
    setDragStartPositions,
    setIsDraggingImage,
    setHiddenVideoControlsIds,
    saveToHistory,
  } = opts;

  function makeDragMove<T extends PlacedImage | PlacedVideo>(
    element: T,
    setItems: React.Dispatch<React.SetStateAction<T[]>>,
  ) {
    return (e: unknown, newAttrs: Partial<T>): Partial<T> => {
      // Apply snapping during drag
      const updated = { ...element, ...newAttrs };
      const snapping = getSnapping(updated as PlacedImage | PlacedVideo);

      if (snapping.guides.length > 0) {
        updateGuideLines(snapping.guides);

        // Apply snapping to the dragged element
        const snappedAttrs = {
          ...newAttrs,
          ...(snapping.snappedX !== undefined && {
            x: snapping.snappedX,
          }),
          ...(snapping.snappedY !== undefined && {
            y: snapping.snappedY,
          }),
        };

        setItems((prev) =>
          prev.map((it) =>
            it.id === element.id ? { ...it, ...snappedAttrs } : it,
          ),
        );

        // Update other selected items with the same delta
        if (selectedIds.length > 1) {
          const deltaX =
            ((snappedAttrs as { x?: number }).x ??
              (newAttrs as { x?: number }).x ??
              element.x) - element.x;
          const deltaY =
            ((snappedAttrs as { y?: number }).y ??
              (newAttrs as { y?: number }).y ??
              element.y) - element.y;

          setItems((prev) =>
            applyDragDelta(
              prev,
              selectedIds,
              element.id,
              { x: deltaX, y: deltaY },
              dragStartPositions,
            ),
          );
        }

        // Return the snapped coordinates to update the Konva node
        return snappedAttrs;
      } else {
        clearGuideLines();
        setItems((prev) =>
          prev.map((it) =>
            it.id === element.id ? { ...it, ...newAttrs } : it,
          ),
        );
        // Return the new attributes to update the Konva node
        return newAttrs;
      }
    };
  }

  function makeDragStart<T extends PlacedImage | PlacedVideo>(
    element: T,
    items: T[],
    isVideo: boolean,
  ) {
    return () => {
      // If dragging a selected item in a multi-selection, keep the selection
      // If dragging an unselected item, select only that item
      let currentSelectedIds = selectedIds;
      if (!selectedIds.includes(element.id)) {
        currentSelectedIds = [element.id];
        setSelectedIds(currentSelectedIds);
      }

      setIsDraggingImage(true);
      // Hide video controls during drag
      if (isVideo) {
        setHiddenVideoControlsIds((prev) => new Set([...prev, element.id]));
      }
      // Save positions of all selected items
      const positions = new Map<string, { x: number; y: number }>();
      currentSelectedIds.forEach((id) => {
        const it = items.find((i) => i.id === id);
        if (it) {
          positions.set(id, { x: it.x, y: it.y });
        }
      });
      setDragStartPositions(positions);
    };
  }

  function makeDragEnd<T extends PlacedImage | PlacedVideo>(
    element: T,
    isVideo: boolean,
  ) {
    return () => {
      setIsDraggingImage(false);
      clearGuideLines();
      if (isVideo) {
        // Show video controls after drag ends
        setHiddenVideoControlsIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(element.id);
          return newSet;
        });
      }
      saveToHistory();
      setDragStartPositions(new Map());
    };
  }

  const imageDragHandlers = (image: PlacedImage) => ({
    onDragMove: makeDragMove(image, setImages),
    onDragStart: makeDragStart(image, images, false),
    onDragEnd: makeDragEnd(image, false),
  });

  const videoDragHandlers = (video: PlacedVideo) => ({
    onDragMove: makeDragMove(video, setVideos),
    onDragStart: makeDragStart(video, videos, true),
    onDragEnd: makeDragEnd(video, true),
  });

  return { imageDragHandlers, videoDragHandlers };
}
