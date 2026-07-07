import React, { useCallback, useEffect, useState } from "react";
import { canvasStorage, type CanvasState } from "@/lib/instant-storage";
import {
  imageToCanvasElement,
  videoToCanvasElement,
  type Viewport,
} from "@/utils/canvas-utils";
import type { PlacedImage, PlacedVideo } from "@/types/canvas";
import type { useToast } from "@/hooks/use-toast";
import type { useAgentRun } from "@/hooks/useAgentRun";

// Owns the client-side persistence layer: the debounced write-behind to
// InstantDB (saveToStorage), the initial load (loadFromStorage), and the
// reactive merge that folds server-side element inserts (agent output, other
// tabs) into local canvas state without clobbering in-progress edits.
export function useCanvasPersistence(opts: {
  projectId: string;
  userId: string | null;
  sessionId: string | null | undefined;
  images: PlacedImage[];
  videos: PlacedVideo[];
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  setVideos: React.Dispatch<React.SetStateAction<PlacedVideo[]>>;
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  agentStatus: ReturnType<typeof useAgentRun>["status"];
  projectElements: unknown[] | undefined;
  toast: ReturnType<typeof useToast>;
}): {
  isStorageLoaded: boolean;
  saveToStorage: () => Promise<void>;
} {
  const {
    projectId,
    userId,
    sessionId,
    images,
    videos,
    setImages,
    setVideos,
    viewport,
    setViewport,
    agentStatus,
    projectElements,
    toast,
  } = opts;

  const [isStorageLoaded, setIsStorageLoaded] = useState(false);

  // Save current state to storage
  const saveToStorage = useCallback(async () => {
    try {
      // Save actual image data to InstantDB
      const imageSavePromises = images.map(async (image) => {
        try {
          // Skip if src is undefined or if it's a placeholder for generation
          if (
            !image.src ||
            image.src.startsWith("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP")
          ) {
            return;
          }

          // Check if we already have this image stored
          const existingImage = await canvasStorage.getImage(image.id);
          if (!existingImage) {
            console.log(`[CANVAS] Saving new image ${image.id}`);
            await canvasStorage.saveImage(image.src, image.id, {
              prompt: image.generationPrompt,
              creditsConsumed: image.creditsConsumed,
              referencedAssetIds: image.referencedAssetIds,
            });
            console.log(`[CANVAS] Image ${image.id} saved successfully`);
          } else {
            console.log(
              `[CANVAS] Image ${image.id} already exists, skipping save`,
            );
          }
        } catch (error) {
          console.error(`[CANVAS] Failed to save image ${image.id}:`, error);
        }
      });

      // Wait for all image saves to complete
      await Promise.all(imageSavePromises);

      // Save video data to InstantDB
      const videoSavePromises = videos.map(async (video) => {
        try {
          // Skip if src is undefined or if it's a placeholder for generation
          if (
            !video.src ||
            video.src.startsWith("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP")
          ) {
            return;
          }

          // Check if we already have this video stored
          const existingVideo = await canvasStorage.getVideo(video.id);
          if (!existingVideo) {
            console.log(`[CANVAS] Saving new video ${video.id}`);
            await canvasStorage.saveVideo(video.src, video.duration, video.id, {
              referencedAssetIds: video.referencedAssetIds,
            });
            console.log(`[CANVAS] Video ${video.id} saved successfully`);
          } else {
            console.log(
              `[CANVAS] Video ${video.id} already exists, skipping save`,
            );
          }
        } catch (error) {
          console.error(`[CANVAS] Failed to save video ${video.id}:`, error);
        }
      });

      // Wait for all video saves to complete
      await Promise.all(videoSavePromises);

      // Save canvas state (positions, transforms, etc.)
      const canvasState: CanvasState = {
        elements: [
          ...images.map(imageToCanvasElement),
          ...videos.map(videoToCanvasElement),
        ],
        backgroundColor: "#ffffff",
        lastModified: Date.now(),
        viewport: viewport,
      };
      await canvasStorage.saveCanvasState(canvasState);
    } catch (error) {
      console.error("[CANVAS] Failed to save canvas state:", error);
    }
  }, [images, videos, viewport]);

  // Load state from storage
  const loadFromStorage = useCallback(async () => {
    try {
      const canvasState = await canvasStorage.getCanvasState();

      if (!canvasState) {
        setIsStorageLoaded(true);
        return;
      }

      const loadedImages: PlacedImage[] = [];
      const loadedVideos: PlacedVideo[] = [];

      for (const element of canvasState.elements) {
        if (element.type === "image" && element.imageId) {
          const imageData = await canvasStorage.getImage(element.imageId);
          if (imageData) {
            loadedImages.push({
              id: element.id,
              src: imageData.originalDataUrl,
              x: element.transform.x,
              y: element.transform.y,
              width: element.width || 300,
              height: element.height || 300,
              rotation: element.transform.rotation,
              ...(element.transform.cropBox && {
                cropX: element.transform.cropBox.x,
                cropY: element.transform.cropBox.y,
                cropWidth: element.transform.cropBox.width,
                cropHeight: element.transform.cropBox.height,
              }),
            });
          }
        } else if (element.type === "video" && element.videoId) {
          const videoData = await canvasStorage.getVideo(element.videoId);
          if (videoData) {
            loadedVideos.push({
              id: element.id,
              src: videoData.originalDataUrl,
              x: element.transform.x,
              y: element.transform.y,
              width: element.width || 300,
              height: element.height || 300,
              rotation: element.transform.rotation,
              isVideo: true,
              duration: element.duration || videoData.duration,
              currentTime: element.currentTime || 0,
              isPlaying: element.isPlaying || false,
              volume: element.volume || 1,
              muted: element.muted || false,
              isLoaded: false, // Initialize as not loaded
              ...(element.transform.cropBox && {
                cropX: element.transform.cropBox.x,
                cropY: element.transform.cropBox.y,
                cropWidth: element.transform.cropBox.width,
                cropHeight: element.transform.cropBox.height,
              }),
            });
          }
        }
      }

      // Set loaded images and videos
      if (loadedImages.length > 0) {
        setImages(loadedImages);
      }

      if (loadedVideos.length > 0) {
        setVideos(loadedVideos);
      }

      // Restore viewport if available
      if (canvasState.viewport) {
        setViewport(canvasState.viewport);
      }

      // Check if any elements are missing asset links and fix them
      const missingAssets = canvasState.elements.filter(
        (el) => el.type === "image" && !el.imageId,
      );
      if (missingAssets.length > 0) {
        console.log(
          `Found ${missingAssets.length} elements with missing asset links, fixing...`,
        );
        await canvasStorage.fixMissingAssetLinks();
        // Reload after fixing
        const fixedState = await canvasStorage.getCanvasState();
        if (fixedState) {
          // Reload images with fixed asset links
          const reloadedImages: PlacedImage[] = [];
          for (const element of fixedState.elements) {
            if (element.type === "image" && element.imageId) {
              const imageData = await canvasStorage.getImage(element.imageId);
              if (imageData) {
                reloadedImages.push({
                  id: element.id,
                  src: imageData.originalDataUrl,
                  x: element.transform.x,
                  y: element.transform.y,
                  width: element.width || 300,
                  height: element.height || 300,
                  rotation: element.transform.rotation,
                  ...(element.transform.cropBox && {
                    cropX: element.transform.cropBox.x,
                    cropY: element.transform.cropBox.y,
                    cropWidth: element.transform.cropBox.width,
                    cropHeight: element.transform.cropBox.height,
                  }),
                });
              }
            }
          }
          if (reloadedImages.length > 0) {
            setImages(reloadedImages);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load from storage:", error);
      toast.add({
        title: "Failed to restore canvas",
        description: "Starting with a fresh canvas",
        type: "error",
      });
    } finally {
      setIsStorageLoaded(true);
    }
  }, [toast]);

  // Initialize storage with user or session ID and project ID
  useEffect(() => {
    const initializeStorage = async () => {
      console.log("[CANVAS] Initializing storage with:", {
        userId,
        sessionId,
        projectId,
      });

      canvasStorage.setUser(userId, sessionId ?? null);

      if (projectId) {
        canvasStorage.setCurrentProject(projectId);
        console.log("[CANVAS] Loading from storage for project:", projectId);
        // Load from storage after project ID is set
        await loadFromStorage();
        // History is now loaded automatically via db.useQuery
      }
    };

    initializeStorage();
  }, [userId, sessionId, projectId, loadFromStorage]);

  // When an agent run completes, reload the canvas so the generated media (persisted
  // server-side as new canvas elements) appears without a manual refresh.
  useEffect(() => {
    if (agentStatus === "done") {
      void loadFromStorage();
    }
  }, [agentStatus, loadFromStorage]);

  // Reactively merge server-side element inserts (agent-generated media, other
  // tabs) into local canvas state. Only ADDS elements this client doesn't have —
  // never overwrites in-progress local edits, never removes (deletions are
  // explicit via handleDelete). This is what makes agent output appear without a
  // manual reload; with the destructive save-reconcile removed, it also can't be
  // clobbered by a stale save.
  useEffect(() => {
    if (!isStorageLoaded) return;
    const dbElements = (projectElements ?? []) as any[];
    if (dbElements.length === 0) return;
    const one = (v: any) => (Array.isArray(v) ? v[0] : v);
    const cropOf = (el: any) =>
      el.cropX !== undefined
        ? {
            cropX: el.cropX,
            cropY: el.cropY,
            cropWidth: el.cropWidth,
            cropHeight: el.cropHeight,
          }
        : {};

    setImages((prev) => {
      const have = new Set(prev.map((i) => i.id));
      const additions: PlacedImage[] = [];
      for (const el of dbElements) {
        if (el.type !== "image" || have.has(el.id)) continue;
        const asset = one(el.asset);
        const url = one(asset?.file)?.url;
        if (!url) continue;
        additions.push({
          id: el.id,
          src: url,
          x: el.x ?? 0,
          y: el.y ?? 0,
          width: el.width ?? 300,
          height: el.height ?? 300,
          rotation: el.rotation ?? 0,
          ...cropOf(el),
          ...(asset?.prompt ? { generationPrompt: asset.prompt } : {}),
          ...(asset?.creditsConsumed
            ? { creditsConsumed: asset.creditsConsumed }
            : {}),
        });
      }
      return additions.length ? [...prev, ...additions] : prev;
    });

    setVideos((prev) => {
      const have = new Set(prev.map((v) => v.id));
      const additions: PlacedVideo[] = [];
      for (const el of dbElements) {
        if (el.type !== "video" || have.has(el.id)) continue;
        const asset = one(el.asset);
        const url = one(asset?.file)?.url;
        if (!url) continue;
        additions.push({
          id: el.id,
          src: url,
          x: el.x ?? 0,
          y: el.y ?? 0,
          width: el.width ?? 300,
          height: el.height ?? 300,
          rotation: el.rotation ?? 0,
          isVideo: true,
          duration: el.duration ?? asset?.duration ?? 0,
          currentTime: el.currentTime ?? 0,
          isPlaying: el.isPlaying ?? false,
          volume: el.volume ?? 1,
          muted: el.muted ?? false,
          isLoaded: false,
          ...cropOf(el),
        });
      }
      return additions.length ? [...prev, ...additions] : prev;
    });
  }, [projectElements, isStorageLoaded]);

  // Auto-save to storage when images or videos change (with debounce)
  useEffect(() => {
    if (!isStorageLoaded) return; // Don't save until we've loaded

    const timeoutId = setTimeout(() => {
      saveToStorage();
    }, 500); // Reduced to 500ms for faster saving

    return () => clearTimeout(timeoutId);
  }, [images, videos, viewport, isStorageLoaded, saveToStorage]);

  // Save canvas assets when page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isStorageLoaded) {
        console.log("[CANVAS] Page hidden, saving assets...");
        saveToStorage();
        // History saves automatically via InstantDB transactions
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isStorageLoaded, saveToStorage]);

  return { isStorageLoaded, saveToStorage };
}
