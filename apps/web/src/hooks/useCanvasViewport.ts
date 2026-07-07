import React, { useEffect, useRef, useState } from "react";
import type Konva from "konva";
import type { PlacedImage, PlacedVideo, SelectionBox } from "@/types/canvas";
import { createFrameCoalescer } from "@/utils/performance";

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
  const [viewport, setViewport] = useState<Viewport>({
    x: 0,
    y: 0,
    scale: 1,
  });

  // Gesture-internal positions live in refs, not state: nothing renders them,
  // and putting them in state forced a full page re-render per pointer move.
  const lastPanPosition = useRef({ x: 0, y: 0 });
  const lastTouchDistance = useRef<number | null>(null);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  const isTouchingImage = useRef(false);

  // Wheel/pinch/pan events fire faster than the display refreshes, and each
  // setViewport re-renders the whole canvas page. Coalesce them: handlers
  // compute from the latest pending value (not the stale render-time closure)
  // and flush at most one setViewport per animation frame.
  const [viewportQueue] = useState(() =>
    createFrameCoalescer<Viewport>((v) => setViewport(v)),
  );
  viewportQueue.sync(viewport);
  const currentViewport = viewportQueue.current;
  const queueViewport = viewportQueue.queue;

  useEffect(() => {
    return () => viewportQueue.cancel();
  }, [viewportQueue]);

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

    const vp = currentViewport();

    // Check if this is a pinch gesture (ctrl key is pressed on trackpad pinch)
    if (e.evt.ctrlKey) {
      // This is a pinch-to-zoom gesture
      const oldScale = vp.scale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const mousePointTo = {
        x: (pointer.x - vp.x) / oldScale,
        y: (pointer.y - vp.y) / oldScale,
      };

      // Zoom based on deltaY (negative = zoom in, positive = zoom out)
      const scaleBy = 1.01;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const steps = Math.min(Math.abs(e.evt.deltaY), 10);
      const newScale = oldScale * Math.pow(scaleBy, direction * steps);

      // Limit zoom (10% to 500%)
      const scale = Math.max(0.1, Math.min(5, newScale));

      queueViewport({
        x: pointer.x - mousePointTo.x * scale,
        y: pointer.y - mousePointTo.y * scale,
        scale,
      });
    } else {
      // This is a pan gesture (two-finger swipe on trackpad or mouse wheel)
      const deltaX = e.evt.shiftKey ? e.evt.deltaY : e.evt.deltaX;
      const deltaY = e.evt.shiftKey ? 0 : e.evt.deltaY;

      // Invert the direction to match natural scrolling
      queueViewport({ ...vp, x: vp.x - deltaX, y: vp.y - deltaY });
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

      lastTouchDistance.current = distance;
      lastTouchCenter.current = center;
    } else if (touches.length === 1) {
      // Single finger - check if touching an image
      const touch = { x: touches[0].clientX, y: touches[0].clientY };

      // Check if we're touching an image
      if (stage) {
        const pos = stage.getPointerPosition();
        if (pos) {
          const vp = currentViewport();
          const canvasPos = {
            x: (pos.x - vp.x) / vp.scale,
            y: (pos.y - vp.y) / vp.scale,
          };

          // Check if touch is on any image
          isTouchingImage.current = images.some((img) => {
            return (
              canvasPos.x >= img.x &&
              canvasPos.x <= img.x + img.width &&
              canvasPos.y >= img.y &&
              canvasPos.y <= img.y + img.height
            );
          });
        }
      }

      lastTouchCenter.current = touch;
    }
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;

    if (touches.length === 2 && lastTouchDistance.current) {
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
      const vp = currentViewport();
      const scaleFactor = distance / lastTouchDistance.current;
      const newScale = Math.max(0.1, Math.min(5, vp.scale * scaleFactor));

      // Calculate new position to zoom towards pinch center
      const stage = stageRef.current;
      if (stage) {
        const stageBox = stage.container().getBoundingClientRect();
        const stageCenter = {
          x: center.x - stageBox.left,
          y: center.y - stageBox.top,
        };

        const mousePointTo = {
          x: (stageCenter.x - vp.x) / vp.scale,
          y: (stageCenter.y - vp.y) / vp.scale,
        };

        queueViewport({
          x: stageCenter.x - mousePointTo.x * newScale,
          y: stageCenter.y - mousePointTo.y * newScale,
          scale: newScale,
        });
      }

      lastTouchDistance.current = distance;
      lastTouchCenter.current = center;
    } else if (
      touches.length === 1 &&
      lastTouchCenter.current &&
      !isSelecting &&
      !isDraggingImage &&
      !isTouchingImage.current
    ) {
      // Single finger - handle pan (only if not selecting, dragging, or touching an image)
      // Don't prevent default if there might be system dialogs open
      const hasActiveFileInput = document.querySelector('input[type="file"]');
      if (!hasActiveFileInput) {
        e.evt.preventDefault();
      }

      const touch = { x: touches[0].clientX, y: touches[0].clientY };
      const deltaX = touch.x - lastTouchCenter.current.x;
      const deltaY = touch.y - lastTouchCenter.current.y;

      const vp = currentViewport();
      queueViewport({ ...vp, x: vp.x + deltaX, y: vp.y + deltaY });

      lastTouchCenter.current = touch;
    }
  };

  const handleTouchEnd = (_e: Konva.KonvaEventObject<TouchEvent>) => {
    lastTouchDistance.current = null;
    lastTouchCenter.current = null;
    isTouchingImage.current = false;
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
      lastPanPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
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
      const deltaX = e.evt.clientX - lastPanPosition.current.x;
      const deltaY = e.evt.clientY - lastPanPosition.current.y;

      const vp = currentViewport();
      queueViewport({ ...vp, x: vp.x + deltaX, y: vp.y + deltaY });

      lastPanPosition.current = { x: e.evt.clientX, y: e.evt.clientY };
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
