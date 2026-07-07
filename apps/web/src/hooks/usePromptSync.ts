import React, { useRef } from "react";
import type Konva from "konva";
import type { PromptEditorHandle } from "@/components/canvas/PromptEditor";
import type { PlacedImage, PlacedVideo } from "@/types/canvas";

// Bidirectional selection ↔ prompt-editor asset-reference sync. Canvas
// selection inserts/removes @-references in the prompt editor, and prompt
// edits push selection back. `syncSourceRef` breaks the feedback loop: whoever
// initiated the change is recorded so the other side ignores the echo.
export function usePromptSync(opts: {
  promptEditorRef: React.RefObject<PromptEditorHandle | null>;
  images: PlacedImage[];
  videos: PlacedVideo[];
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
}): {
  handleSelect: (
    id: string,
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void;
  clearSelection: () => void;
  onAssetReferencesChange: (assetIds: string[]) => void;
} {
  const { promptEditorRef, images, videos, selectedIds, setSelectedIds } = opts;
  // Track sync source to avoid infinite loops in bidirectional sync
  const syncSourceRef = useRef<"canvas" | "prompt" | null>(null);

  // Handle selection
  const handleSelect = (
    id: string,
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => {
    syncSourceRef.current = "canvas";

    const image = images.find((img) => img.id === id);
    const isImage = !!image;

    if (e.evt.shiftKey || e.evt.metaKey || e.evt.ctrlKey) {
      // Multi-select toggle
      const isCurrentlySelected = selectedIds.includes(id);
      const newSelection = isCurrentlySelected
        ? selectedIds.filter((i) => i !== id)
        : [...selectedIds, id];

      // Sync to prompt editor for assets
      if (promptEditorRef.current) {
        if (isCurrentlySelected) {
          promptEditorRef.current.removeAssetReference(id);
        } else {
          // Only insert if it's an image or video
          const asset = image || videos.find((v) => v.id === id);
          if (asset) {
            promptEditorRef.current.insertAssetReference(asset);
          }
        }
      }

      setSelectedIds(newSelection);
    } else {
      // Single select - clear others, select this one
      // Remove old asset references
      if (promptEditorRef.current) {
        const currentRefs = promptEditorRef.current.getReferencedAssetIds();
        currentRefs.forEach((refId) => {
          if (refId !== id) {
            promptEditorRef.current?.removeAssetReference(refId);
          }
        });
        // Add new reference if it's an asset and not already referenced
        const asset = image || videos.find((v) => v.id === id);
        if (asset && !currentRefs.includes(id)) {
          promptEditorRef.current.insertAssetReference(asset);
        }
      }
      setSelectedIds([id]);
    }

    // Reset sync source after a tick
    setTimeout(() => {
      syncSourceRef.current = null;
    }, 0);
  };

  // Clear all asset references when clicking empty canvas
  const clearSelection = () => {
    syncSourceRef.current = "canvas";
    if (promptEditorRef.current) {
      const currentRefs = promptEditorRef.current.getReferencedAssetIds();
      currentRefs.forEach((refId) => {
        promptEditorRef.current?.removeAssetReference(refId);
      });
    }
    setSelectedIds([]);
    setTimeout(() => {
      syncSourceRef.current = null;
    }, 0);
  };

  const onAssetReferencesChange = (assetIds: string[]) => {
    // Only sync if the change came from the prompt editor, not from canvas
    if (syncSourceRef.current === "canvas") return;

    syncSourceRef.current = "prompt";
    // Sync canvas selection when @ asset references change in prompt
    setSelectedIds(assetIds);
    // Reset sync source after a tick
    setTimeout(() => {
      syncSourceRef.current = null;
    }, 0);
  };

  return { handleSelect, clearSelection, onAssetReferencesChange };
}
