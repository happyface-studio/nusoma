import { useEffect, Dispatch, SetStateAction, RefObject } from "react";
import { type Editor } from "@tiptap/react";
import type { PromptAction } from "@/lib/prompt-actions";
import type { PlacedImage, PlacedVideo } from "@/types/canvas";

interface UseMenuInteractionsProps {
  editor: Editor | null;

  showMenu: boolean;
  setShowMenu: Dispatch<SetStateAction<boolean>>;
  showImageMenu: boolean;
  setShowImageMenu: Dispatch<SetStateAction<boolean>>;

  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  imageMenuSelectedIndex: number;
  setImageMenuSelectedIndex: Dispatch<SetStateAction<number>>;

  setSearchQuery: Dispatch<SetStateAction<string>>;
  setImageSearchQuery: Dispatch<SetStateAction<string>>;

  slashPositionRef: RefObject<number | null>;
  atPositionRef: RefObject<number | null>;

  filteredItems: any[];
  filteredAssets: any[];
  isGenerating: boolean;
  generationSettings: any;
  handleRun: () => void;
  insertStyleChip: (action: PromptAction) => void;
  insertAssetRefChip: (asset: PlacedImage | PlacedVideo) => void;
}

export function useMenuInteractions({
  editor,
  showMenu,
  setShowMenu,
  showImageMenu,
  setShowImageMenu,
  selectedIndex,
  setSelectedIndex,
  imageMenuSelectedIndex,
  setImageMenuSelectedIndex,
  setSearchQuery,
  setImageSearchQuery,
  slashPositionRef,
  atPositionRef,
  filteredItems,
  filteredAssets,
  isGenerating,
  generationSettings,
  handleRun,
  insertStyleChip,
  insertAssetRefChip,
}: UseMenuInteractionsProps) {
  // Expose toggle handlers if needed, but the effect uses setters directly.

  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showMenu) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredItems.length - 1 ? prev + 1 : prev,
          );
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (filteredItems[selectedIndex]) {
            filteredItems[selectedIndex].action();
          }
        } else if (e.key === "Escape") {
          e.preventDefault();

          // Delete the slash and search query
          if (editor && slashPositionRef.current !== null) {
            const { from } = editor.state.selection;
            editor
              .chain()
              .deleteRange({ from: slashPositionRef.current, to: from })
              .focus()
              .run();
          }

          setShowMenu(false);
          slashPositionRef.current = null;
          setSearchQuery("");
        }
      } else if (showImageMenu) {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          setImageMenuSelectedIndex((prev) =>
            prev < filteredAssets.length - 1 ? prev + 1 : prev,
          );
        } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          setImageMenuSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (filteredAssets[imageMenuSelectedIndex]) {
            insertAssetRefChip(filteredAssets[imageMenuSelectedIndex]);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();

          // Delete the @ and search query
          if (editor && atPositionRef.current !== null) {
            const { from } = editor.state.selection;
            editor
              .chain()
              .deleteRange({ from: atPositionRef.current, to: from })
              .focus()
              .run();
          }

          setShowImageMenu(false);
          atPositionRef.current = null;
          setImageSearchQuery("");
        }
      } else {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          if (!isGenerating && generationSettings.prompt.trim()) {
            handleRun();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [
    editor,
    showMenu,
    showImageMenu,
    filteredItems,
    filteredAssets,
    selectedIndex,
    imageMenuSelectedIndex,
    isGenerating,
    generationSettings,
    handleRun,
    insertStyleChip,
    insertAssetRefChip,
    setShowMenu,
    setSelectedIndex,
    setShowImageMenu,
    setImageMenuSelectedIndex,
    setSearchQuery,
    setImageSearchQuery,
    slashPositionRef, // Refs are stable
    atPositionRef,
  ]);

  return {}; // No logic returned, just side effects
}
