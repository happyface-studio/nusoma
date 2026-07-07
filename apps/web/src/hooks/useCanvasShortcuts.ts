import React, { useEffect } from "react";
import type { PlacedImage, GenerationSettings } from "@/types/canvas";
import type { Viewport } from "@/utils/canvas-utils";

// Global keyboard shortcuts for the canvas: undo/redo, select-all, delete,
// duplicate, run, layer ordering, zoom, and crop-escape. Input/contenteditable
// targets are ignored so typing in the prompt editor isn't hijacked.
export function useCanvasShortcuts(opts: {
  selectedIds: string[];
  images: PlacedImage[];
  generationSettings: GenerationSettings;
  croppingImageId: string | null;
  setCroppingImageId: React.Dispatch<React.SetStateAction<string | null>>;
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  canvasSize: { width: number; height: number };
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  undo: () => void;
  redo: () => void;
  handleDelete: () => void;
  handleDuplicate: () => void;
  handleRun: () => Promise<void>;
  sendToFront: () => void;
  sendToBack: () => void;
  bringForward: () => void;
  sendBackward: () => void;
}): void {
  const {
    selectedIds,
    images,
    generationSettings,
    croppingImageId,
    setCroppingImageId,
    viewport,
    setViewport,
    canvasSize,
    setSelectedIds,
    undo,
    redo,
    handleDelete,
    handleDuplicate,
    handleRun,
    sendToFront,
    sendToBack,
    bringForward,
    sendBackward,
  } = opts;

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if target is an input element or contenteditable (for TipTap editor)
      const isInputElement =
        e.target &&
        ((e.target as HTMLElement).matches("input, textarea") ||
          (e.target as HTMLElement).isContentEditable ||
          (e.target as HTMLElement).closest(".ProseMirror"));

      // Undo/Redo
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        (e.metaKey || e.ctrlKey) &&
        ((e.key === "z" && e.shiftKey) || e.key === "y")
      ) {
        e.preventDefault();
        redo();
      }
      // Select all
      else if ((e.metaKey || e.ctrlKey) && e.key === "a" && !isInputElement) {
        e.preventDefault();
        setSelectedIds(images.map((img) => img.id));
      }
      // Delete
      else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !isInputElement
      ) {
        if (selectedIds.length > 0) {
          e.preventDefault();
          handleDelete();
        }
      }
      // Duplicate
      else if ((e.metaKey || e.ctrlKey) && e.key === "d" && !isInputElement) {
        e.preventDefault();
        if (selectedIds.length > 0) {
          handleDuplicate();
        }
      }
      // Run generation
      else if (
        (e.metaKey || e.ctrlKey) &&
        e.key === "Enter" &&
        !isInputElement
      ) {
        e.preventDefault();
        if (generationSettings.prompt.trim()) {
          handleRun();
        }
      }
      // Layer ordering shortcuts
      else if (e.key === "]" && !isInputElement) {
        e.preventDefault();
        if (selectedIds.length > 0) {
          if (e.metaKey || e.ctrlKey) {
            sendToFront();
          } else {
            bringForward();
          }
        }
      } else if (e.key === "[" && !isInputElement) {
        e.preventDefault();
        if (selectedIds.length > 0) {
          if (e.metaKey || e.ctrlKey) {
            sendToBack();
          } else {
            sendBackward();
          }
        }
      }
      // Escape to exit crop mode
      else if (e.key === "Escape" && croppingImageId) {
        e.preventDefault();
        setCroppingImageId(null);
      }
      // Zoom in
      else if ((e.key === "+" || e.key === "=") && !isInputElement) {
        e.preventDefault();
        const newScale = Math.min(5, viewport.scale * 1.2);
        const centerX = canvasSize.width / 2;
        const centerY = canvasSize.height / 2;

        const mousePointTo = {
          x: (centerX - viewport.x) / viewport.scale,
          y: (centerY - viewport.y) / viewport.scale,
        };

        setViewport({
          x: centerX - mousePointTo.x * newScale,
          y: centerY - mousePointTo.y * newScale,
          scale: newScale,
        });
      }
      // Zoom out
      else if (e.key === "-" && !isInputElement) {
        e.preventDefault();
        const newScale = Math.max(0.1, viewport.scale / 1.2);
        const centerX = canvasSize.width / 2;
        const centerY = canvasSize.height / 2;

        const mousePointTo = {
          x: (centerX - viewport.x) / viewport.scale,
          y: (centerY - viewport.y) / viewport.scale,
        };

        setViewport({
          x: centerX - mousePointTo.x * newScale,
          y: centerY - mousePointTo.y * newScale,
          scale: newScale,
        });
      }
      // Reset zoom
      else if (e.key === "0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setViewport({ x: 0, y: 0, scale: 1 });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Currently no key up handlers needed
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    selectedIds,
    images,
    generationSettings,
    undo,
    redo,
    handleDelete,
    handleDuplicate,
    handleRun,
    croppingImageId,
    viewport,
    canvasSize,
    sendToFront,
    sendToBack,
    bringForward,
    sendBackward,
  ]);
}
