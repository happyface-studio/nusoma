import React, { useEffect, useState } from "react";
import type Konva from "konva";
import type { PlacedImage, PlacedVideo, SelectionBox } from "@/types/canvas";

export type { Viewport } from "@/utils/canvas-utils";
import type { Viewport } from "@/utils/canvas-utils";

// Owns pan/zoom viewport, canvas dimensions, and the pointer/touch gestures that
// drive them (wheel zoom, pinch zoom, middle-mouse pan, marquee selection).
// State that other parts of the page read (viewport, canvasSize, selectionBox,
// isPanningCanvas, isCanvasReady) is returned; the rest stays internal.
export function useCanvasViewport(opts: {
  stageRef: React.RefObject<Konva.Stage | null>;
  images: PlacedImage[];
  videos: PlacedVideo[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  isDraggingImage: boolean;
  croppingImageId: string | null;
  setCroppingImageId: React.Dispatch<React.SetStateAction<string | null>>;
  onClearSelection: () => void;
}) {
  const {
    stageRef,
    images,
    videos,
    setSelectedIds,
    isDraggingImage,
    croppingImageId,
    setCroppingImageId,
    onClearSelection,
  } = opts;

  const [selectionBox, setSelectionBox] = useState<SelectionBox>({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    visible: false,
  });
  const [isSelecting, setIsSelecting] = useState(false);
  // Use a consistent initial value for server and client to avoid hydration errors
  const [canvasSize, setCanvasSize] = useState({
    width: 1200,
    height: 800,
  });
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState<Viewport>({
    x: 0,
    y: 0,
    scale: 1,
  });

  // Touch event states for mobile
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(
    null,
  );
  const [lastTouchCenter, setLastTouchCenter] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isTouchingImage, setIsTouchingImage] = useState(false);

  // Set canvas ready state after mount
  useEffect(() => {
    // Only set canvas ready after we have valid dimensions
    if (canvasSize.width > 0 && canvasSize.height > 0) {
      setIsCanvasReady(true);
    }
  }, [canvasSize]);

  // Update canvas size on window resize
  useEffect(() => {
    const updateCanvasSize = () => {
      setCanvasSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    // Set initial size
    updateCanvasSize();

    // Update on resize
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, []);

  // Prevent body scrolling on mobile
  useEffect(() => {
    // Prevent scrolling on mobile
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";

    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.height = "";
    };
  }, []);

  // Handle wheel for zoom
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    // Check if this is a pinch gesture (ctrl key is pressed on trackpad pinch)
    if (e.evt.ctrlKey) {
      // This is a pinch-to-zoom gesture
      const oldScale = viewport.scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - viewport.x) / oldScale,
        y: (pointer.y - viewport.y) / oldScale,
      };

      // Zoom based on deltaY (negative = zoom in, positive = zoom out)
      const scaleBy = 1.01;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const steps = Math.min(Math.abs(e.evt.deltaY), 10);
      let newScale = oldScale;

      for (let i = 0; i < steps; i++) {
        newScale = direction > 0 ? newScale * scaleBy : newScale / scaleBy;
      }

      // Limit zoom (10% to 500%)
      const scale = Math.max(0.1, Math.min(5, newScale));

      const newPos = {
        x: pointer.x - mousePointTo.x * scale,
        y: pointer.y - mousePointTo.y * scale,
      };

      setViewport({ x: newPos.x, y: newPos.y, scale });
    } else {
      // This is a pan gesture (two-finger swipe on trackpad or mouse wheel)
      const deltaX = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX;
      const deltaY = e.evt.shiftKey ? 0 : e.evt.deltaY;

      // Invert the direction to match natural scrolling
      setViewport((prev) => ({
        ...prev,
        x: prev.x - deltaX,
        y: prev.y - deltaY,
      }));
    }
  };

  // Touch event handlers for mobile
  const handleTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    const stage = stageRef.current;

    if (touches.length === 2) {
      // Two fingers - prepare for pinch-to-zoom
      const touch1 = { x: touches[0].clientX, y: touches[0].clientY };
      const touch2 = { x: touches[1].clientX, y: touches[1].clientY };

      const distance = Math.sqrt(
        Math.pow(touch2.x - touch1.x, 2) + Math.pow(touch2.y - touch1.y, 2),
      );

      const center = {
        x: (touch1.x + touch2.x) / 2,
        y: (touch1.y + touch2.y) / 2,
      };

      setLastTouchDistance(distance);
      setLastTouchCenter(center);
    } else if (touches.length === 1) {
      // Single finger - check if touching an image
      const touch = { x: touches[0].clientX, y: touches[0].clientY };

      // Check if we're touching an image
      if (stage) {
        const pos = stage.getPointerPosition();
        if (pos) {
          const canvasPos = {
            x: (pos.x - viewport.x) / viewport.scale,
            y: (pos.y - viewport.y) / viewport.scale,
          };

          // Check if touch is on any image
          const touchedImage = images.some((img) => {
            return (
              canvasPos.x >= img.x &&
              canvasPos.x <= img.x + img.width &&
              canvasPos.y >= img.y &&
              canvasPos.y <= img.y + img.height
            );
          });

          setIsTouchingImage(touchedImage);
        }
      }

      setLastTouchCenter(touch);
    }
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;

    if (touches.length === 2 && lastTouchDistance && lastTouchCenter) {
      // Two fingers - handle pinch-to-zoom
      e.evt.preventDefault();

      const touch1 = { x: touches[0].clientX, y: touches[0].clientY };
      const touch2 = { x: touches[1].clientX, y: touches[1].clientY };

      const distance = Math.sqrt(
        Math.pow(touch2.x - touch1.x, 2) + Math.pow(touch2.y - touch1.y, 2),
      );

      const center = {
        x: (touch1.x + touch2.x) / 2,
        y: (touch1.y + touch2.y) / 2,
      };

      // Calculate scale change
      const scaleFactor = distance / lastTouchDistance;
      const newScale = Math.max(0.1, Math.min(5, viewport.scale * scaleFactor));

      // Calculate new position to zoom towards pinch center
      const stage = stageRef.current;
      if (stage) {
        const stageBox = stage.container().getBoundingClientRect();
        const stageCenter = {
          x: center.x - stageBox.left,
          y: center.y - stageBox.top,
        };

        const mousePointTo = {
          x: (stageCenter.x - viewport.x) / viewport.scale,
          y: (stageCenter.y - viewport.y) / viewport.scale,
        };

        const newPos = {
          x: stageCenter.x - mousePointTo.x * newScale,
          y: stageCenter.y - mousePointTo.y * newScale,
        };

        setViewport({ x: newPos.x, y: newPos.y, scale: newScale });
      }

      setLastTouchDistance(distance);
      setLastTouchCenter(center);
    } else if (
      touches.length === 1 &&
      lastTouchCenter &&
      !isSelecting &&
      !isDraggingImage &&
      !isTouchingImage
    ) {
      // Single finger - handle pan (only if not selecting, dragging, or touching an image)
      // Don't prevent default if there might be system dialogs open
      const hasActiveFileInput = document.querySelector('input[type="file"]');
      if (!hasActiveFileInput) {
        e.evt.preventDefault();
      }

      const touch = { x: touches[0].clientX, y: touches[0].clientY };
      const deltaX = touch.x - lastTouchCenter.x;
      const deltaY = touch.y - lastTouchCenter.y;

      setViewport((prev) => ({
        ...prev,
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));

      setLastTouchCenter(touch);
    }
  };

  const handleTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    setLastTouchDistance(null);
    setLastTouchCenter(null);
    setIsTouchingImage(false);
  };

  // Handle drag selection and panning
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    const stage = e.target.getStage();
    const mouseButton = e.evt.button; // 0 = left, 1 = middle, 2 = right

    // If middle mouse button, start panning
    if (mouseButton === 1) {
      e.evt.preventDefault();
      setIsPanningCanvas(true);
      setLastPanPosition({ x: e.evt.clientX, y: e.evt.clientY });
      return;
    }

    // If in crop mode and clicked outside, exit crop mode
    if (croppingImageId) {
      const clickedNode = e.target;
      const cropGroup = clickedNode.findAncestor((node: any) => {
        return node.attrs && node.attrs.name === "crop-overlay";
      });

      if (!cropGroup) {
        setCroppingImageId(null);
        return;
      }
    }

    // Start selection box when left-clicking on empty space
    if (clickedOnEmpty && !croppingImageId && mouseButton === 0) {
      const pos = stage?.getPointerPosition();
      if (pos) {
        // Convert screen coordinates to canvas coordinates
        const canvasPos = {
          x: (pos.x - viewport.x) / viewport.scale,
          y: (pos.y - viewport.y) / viewport.scale,
        };

        setIsSelecting(true);
        setSelectionBox({
          startX: canvasPos.x,
          startY: canvasPos.y,
          endX: canvasPos.x,
          endY: canvasPos.y,
          visible: true,
        });

        // Clear all asset references when clicking empty canvas
        onClearSelection();
      }
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();

    // Handle canvas panning with middle mouse
    if (isPanningCanvas) {
      const deltaX = e.evt.clientX - lastPanPosition.x;
      const deltaY = e.evt.clientY - lastPanPosition.y;

      setViewport((prev) => ({
        ...prev,
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));

      setLastPanPosition({ x: e.evt.clientX, y: e.evt.clientY });
      return;
    }

    // Handle selection
    if (!isSelecting) return;

    const pos = stage?.getPointerPosition();
    if (pos) {
      // Convert screen coordinates to canvas coordinates
      const canvasPos = {
        x: (pos.x - viewport.x) / viewport.scale,
        y: (pos.y - viewport.y) / viewport.scale,
      };

      setSelectionBox((prev) => ({
        ...prev,
        endX: canvasPos.x,
        endY: canvasPos.y,
      }));
    }
  };

  const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Stop canvas panning
    if (isPanningCanvas) {
      setIsPanningCanvas(false);
      return;
    }

    if (!isSelecting) return;

    // Calculate which images and videos are in the selection box
    const box = {
      x: Math.min(selectionBox.startX, selectionBox.endX),
      y: Math.min(selectionBox.startY, selectionBox.endY),
      width: Math.abs(selectionBox.endX - selectionBox.startX),
      height: Math.abs(selectionBox.endY - selectionBox.startY),
    };

    // Only select if the box has some size
    if (box.width > 5 || box.height > 5) {
      // Check for images in the selection box
      const selectedImages = images.filter((img) => {
        // Check if image intersects with selection box
        return !(
          img.x + img.width < box.x ||
          img.x > box.x + box.width ||
          img.y + img.height < box.y ||
          img.y > box.y + box.height
        );
      });

      // Check for videos in the selection box
      const selectedVideos = videos.filter((vid) => {
        // Check if video intersects with selection box
        return !(
          vid.x + vid.width < box.x ||
          vid.x > box.x + box.width ||
          vid.y + vid.height < box.y ||
          vid.y > box.y + box.height
        );
      });

      // Combine selected images and videos
      const hitIds = [
        ...selectedImages.map((img) => img.id),
        ...selectedVideos.map((vid) => vid.id),
      ];

      if (hitIds.length > 0) {
        setSelectedIds(hitIds);
      }
    }

    setIsSelecting(false);
    setSelectionBox({ ...selectionBox, visible: false });
  };

  const handleMouseLeave = () => {
    // Stop panning if mouse leaves the stage
    if (isPanningCanvas) {
      setIsPanningCanvas(false);
    }
  };

  return {
    viewport,
    setViewport,
    canvasSize,
    isCanvasReady,
    isPanningCanvas,
    selectionBox,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
