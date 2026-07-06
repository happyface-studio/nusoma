import { useCallback } from "react";
import { id } from "@instantdb/react";
import { PlacedImage, PlacedVideo } from "@/types/canvas";

interface UseCanvasActionsProps {
  images: PlacedImage[];
  videos: PlacedVideo[];
  selectedIds: string[];
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  setVideos: React.Dispatch<React.SetStateAction<PlacedVideo[]>>;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  saveToHistory: () => void;
}

export function useCanvasActions({
  images,
  videos,
  selectedIds,
  setImages,
  setVideos,
  setSelectedIds,
  saveToHistory,
}: UseCanvasActionsProps) {
  // Delete selected items
  const handleDelete = useCallback(() => {
    saveToHistory();
    setImages((prev) => prev.filter((img) => !selectedIds.includes(img.id)));
    setVideos((prev) => prev.filter((vid) => !selectedIds.includes(vid.id)));
    setSelectedIds([]);
  }, [selectedIds, setImages, setVideos, setSelectedIds, saveToHistory]);

  // Duplicate selected items
  const handleDuplicate = useCallback(() => {
    saveToHistory();

    // Duplicate selected images
    const selectedImages = images.filter((img) => selectedIds.includes(img.id));
    const newImages = selectedImages.map((img) => ({
      ...img,
      id: id(),
      x: img.x + 20,
      y: img.y + 20,
    }));

    // Duplicate selected videos
    const selectedVideos = videos.filter((vid) => selectedIds.includes(vid.id));
    const newVideos = selectedVideos.map((vid) => ({
      ...vid,
      id: id(),
      x: vid.x + 20,
      y: vid.y + 20,
      currentTime: 0,
      isPlaying: false,
    }));

    // Update both arrays
    setImages((prev) => [...prev, ...newImages]);
    setVideos((prev) => [...prev, ...newVideos]);

    // Select all duplicated items
    const newIds = [
      ...newImages.map((img) => img.id),
      ...newVideos.map((vid) => vid.id),
    ];
    setSelectedIds(newIds);
  }, [
    selectedIds,
    images,
    videos,
    setImages,
    setVideos,
    setSelectedIds,
    saveToHistory,
  ]);

  // Layer management - Send to front
  const sendToFront = useCallback(() => {
    if (selectedIds.length === 0) return;

    saveToHistory();

    // Handle images
    setImages((prev) => {
      const selectedImages = selectedIds
        .map((id) => prev.find((img) => img.id === id))
        .filter(Boolean) as PlacedImage[];

      const remainingImages = prev.filter(
        (img) => !selectedIds.includes(img.id),
      );

      return [...remainingImages, ...selectedImages];
    });

    // Handle videos
    setVideos((prev) => {
      const selectedVideos = selectedIds
        .map((id) => prev.find((vid) => vid.id === id))
        .filter(Boolean) as PlacedVideo[];

      const remainingVideos = prev.filter(
        (vid) => !selectedIds.includes(vid.id),
      );

      return [...remainingVideos, ...selectedVideos];
    });
  }, [selectedIds, setImages, setVideos, saveToHistory]);

  // Layer management - Send to back
  const sendToBack = useCallback(() => {
    if (selectedIds.length === 0) return;

    saveToHistory();

    // Handle images
    setImages((prev) => {
      const selectedImages = selectedIds
        .map((id) => prev.find((img) => img.id === id))
        .filter(Boolean) as PlacedImage[];

      const remainingImages = prev.filter(
        (img) => !selectedIds.includes(img.id),
      );

      return [...selectedImages, ...remainingImages];
    });

    // Handle videos
    setVideos((prev) => {
      const selectedVideos = selectedIds
        .map((id) => prev.find((vid) => vid.id === id))
        .filter(Boolean) as PlacedVideo[];

      const remainingVideos = prev.filter(
        (vid) => !selectedIds.includes(vid.id),
      );

      return [...selectedVideos, ...remainingVideos];
    });
  }, [selectedIds, setImages, setVideos, saveToHistory]);

  // Layer management - Bring forward
  const bringForward = useCallback(() => {
    if (selectedIds.length === 0) return;

    saveToHistory();

    // Handle images
    setImages((prev) => {
      const result = [...prev];

      for (let i = result.length - 2; i >= 0; i--) {
        if (
          selectedIds.includes(result[i].id) &&
          !selectedIds.includes(result[i + 1].id)
        ) {
          [result[i], result[i + 1]] = [result[i + 1], result[i]];
        }
      }

      return result;
    });

    // Handle videos
    setVideos((prev) => {
      const result = [...prev];

      for (let i = result.length - 2; i >= 0; i--) {
        if (
          selectedIds.includes(result[i].id) &&
          !selectedIds.includes(result[i + 1].id)
        ) {
          [result[i], result[i + 1]] = [result[i + 1], result[i]];
        }
      }

      return result;
    });
  }, [selectedIds, setImages, setVideos, saveToHistory]);

  // Layer management - Send backward
  const sendBackward = useCallback(() => {
    if (selectedIds.length === 0) return;

    saveToHistory();

    // Handle images
    setImages((prev) => {
      const result = [...prev];

      for (let i = 1; i < result.length; i++) {
        if (
          selectedIds.includes(result[i].id) &&
          !selectedIds.includes(result[i - 1].id)
        ) {
          [result[i], result[i - 1]] = [result[i - 1], result[i]];
        }
      }

      return result;
    });

    // Handle videos
    setVideos((prev) => {
      const result = [...prev];

      for (let i = 1; i < result.length; i++) {
        if (
          selectedIds.includes(result[i].id) &&
          !selectedIds.includes(result[i - 1].id)
        ) {
          [result[i], result[i - 1]] = [result[i - 1], result[i]];
        }
      }

      return result;
    });
  }, [selectedIds, setImages, setVideos, saveToHistory]);

  return {
    handleDelete,
    handleDuplicate,
    sendToFront,
    sendToBack,
    bringForward,
    sendBackward,
  };
}
