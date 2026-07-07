"use client";

import React from "react";
import { useState, useCallback } from "react";
import { Stage, Layer } from "react-konva";
import Konva from "konva";
import { canvasStorage } from "@/lib/instant-storage";
import { useAuth } from "@/providers/auth-provider";
import { id } from "@instantdb/react";

import { Button } from "@/components/ui/button";
import { Undo, Redo } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import NumberFlow from "@number-flow/react";
import { DiamondsFourIcon } from "@phosphor-icons/react";
import { useRef, useEffect } from "react";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { getDefaultStyle } from "@/lib/prompt-actions";
import { useToast } from "@/hooks/use-toast";

// Import extracted components
import { StreamingVideo } from "@/components/canvas/StreamingVideo";
import { CropOverlayWrapper } from "@/components/canvas/CropOverlayWrapper";
import { CanvasImage } from "@/components/canvas/CanvasImage";
import { CanvasVideo } from "@/components/canvas/CanvasVideo";
import { ImageToVideoDialog } from "@/components/canvas/ImageToVideoDialog";
import { VideoToVideoDialog } from "@/components/canvas/VideoToVideoDialog";
import { ExtendVideoDialog } from "@/components/canvas/ExtendVideoDialog";
import { RemoveVideoBackgroundDialog } from "@/components/canvas/VideoModelComponents";

// Import types
import type {
  PlacedImage,
  PlacedVideo,
  GenerationSettings,
} from "@/types/canvas";

import { createCroppedImage, uploadFilesAsImages } from "@/utils/canvas-utils";

// Import additional extracted components
import { useFalClient } from "@/hooks/useFalClient";
import { useCanvasAssets } from "@/hooks/useCanvasAssets";
import { useCanvasActions } from "@/hooks/useCanvasActions";
import { useImageOperations } from "@/hooks/useImageOperations";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";
import { useCanvasSnapping } from "@/hooks/useCanvasSnapping";
import { CanvasGrid } from "@/components/canvas/CanvasGrid";
import { SelectionBoxComponent } from "@/components/canvas/SelectionBox";
import { SnapGuideLines } from "@/components/canvas/SnapGuideLines";
import { ZoomControls } from "@/components/canvas/ZoomControls";
import { MobileToolbar } from "@/components/canvas/MobileToolbar";
import { CanvasContextMenu } from "@/components/canvas/CanvasContextMenu";
import { CanvasLeftSidebar } from "@/components/canvas/CanvasLeftSidebar";
import { VideoOverlays } from "@/components/canvas/VideoOverlays";
import { DimensionDisplay } from "@/components/canvas/DimensionDisplay";
import {
  PromptEditor,
  PromptEditorHandle,
} from "@/components/canvas/PromptEditor";
import { GeneratingPlaceholder } from "@/components/canvas/GeneratingPlaceholder";
import { SettingsDialog } from "@/components/canvas/SettingsDialog";
import { db } from "@/lib/db";
import { useAgentRun } from "@/hooks/useAgentRun";
import { usePromptSync } from "@/hooks/usePromptSync";
import { useCanvasViewport } from "@/hooks/useCanvasViewport";
import { useCanvasPersistence } from "@/hooks/useCanvasPersistence";
import { useIsolateObject } from "@/hooks/useIsolateObject";
import { useAgentGeneration } from "@/hooks/useAgentGeneration";
import { useVideoGenerationPipeline } from "@/hooks/useVideoGenerationPipeline";

// Import handlers
import { handleRemoveBackground as handleRemoveBackgroundHandler } from "@/lib/handlers/background-handler";
import { useParams } from "next/navigation";

export default function OverlayPage() {
  const { user, sessionId } = useAuth();
  const params = useParams();
  const projectId = params?.id as string;
  const { start: startAgentRun, status: agentStatus } = useAgentRun();
  const [images, setImages] = useState<PlacedImage[]>([]);
  const [videos, setVideos] = useState<PlacedVideo[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const defaultStyle = getDefaultStyle();
  const toast = useToast();

  const [generationSettings, setGenerationSettings] =
    useState<GenerationSettings>({
      prompt: defaultStyle.prompt,
      loraUrl: defaultStyle.loraUrl || "",
      styleId: defaultStyle.id,
    });
  const [dragStartPositions, setDragStartPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [hiddenVideoControlsIds, setHiddenVideoControlsIds] = useState<
    Set<string>
  >(new Set());
  const [croppingImageId, setCroppingImageId] = useState<string | null>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const promptEditorRef = useRef<PromptEditorHandle>(null);
  const [showGrid, setShowGrid] = useState(true);

  const { handleSelect, clearSelection, onAssetReferencesChange } =
    usePromptSync({
      promptEditorRef,
      images,
      videos,
      selectedIds,
      setSelectedIds,
    });

  const {
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
  } = useCanvasViewport({
    stageRef,
    images,
    videos,
    setSelectedIds,
    isDraggingImage,
    croppingImageId,
    setCroppingImageId,
    onClearSelection: clearSelection,
  });

  // Create FAL client instance with proxy
  const falClient = useFalClient();

  const trpc = useTRPC();

  // Query user credits from Polar (refetched after generation completes)
  const { data: creditsData, refetch: refetchCredits } = useQuery(
    trpc.getUserCredits.queryOptions(undefined, { enabled: !!user?.id }),
  );
  const userCredits = creditsData?.credits ?? 0;

  // Direct FAL upload function using proxy
  const { mutateAsync: removeBackground } = useMutation(
    trpc.removeBackground.mutationOptions(),
  );

  // Fetch project metadata (title + folder)
  const { data: projectData } = db.useQuery(
    projectId
      ? {
          canvasProjects: {
            $: { where: { id: projectId } },
            folder: {},
            // Live element set (incl. asset file URLs) so server-side inserts
            // — e.g. agent-generated media — stream into the canvas reactively.
            elements: { asset: { file: {} } },
          },
        }
      : { canvasProjects: { $: { where: { id: "__none__" } } } },
  );
  const project = projectData?.canvasProjects?.[0];
  const projectName = (project?.name as string) || "Untitled";
  const folderName = (project?.folder?.name as string) || "Drafts";

  const { isStorageLoaded } = useCanvasPersistence({
    projectId,
    userId: user?.id || null,
    sessionId,
    images,
    videos,
    setImages,
    setVideos,
    viewport,
    setViewport,
    agentStatus,
    projectElements: project?.elements,
    toast,
  });

  // Use canvas history hook
  const {
    history,
    historyIndex,
    saveToHistory,
    undo,
    redo,
    restoreHistory,
    canUndo,
    canRedo,
  } = useCanvasHistory({
    projectId,
    images,
    videos,
    selectedIds,
    onRestore: (state) => {
      setImages(state.images);
      setVideos(state.videos || []);
      setSelectedIds(state.selectedIds);
    },
  });

  const { mutateAsync: isolateObject } = useMutation(
    trpc.isolateObject.mutationOptions(),
  );

  const { mutateAsync: generateTextToImage } = useMutation(
    trpc.generateTextToImage.mutationOptions(),
  );

  // Load grid setting from localStorage on mount
  useEffect(() => {
    const savedShowGrid = localStorage.getItem("showGrid");
    if (savedShowGrid !== null) {
      setShowGrid(savedShowGrid === "true");
    }
  }, []);

  // Save grid setting to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("showGrid", showGrid.toString());
  }, [showGrid]);

  // Handle file upload
  const handleFileUpload = (
    files: FileList | null,
    position?: { x: number; y: number },
  ) => {
    if (!files) return;
    uploadFilesAsImages(files, position, viewport, canvasSize, (img) =>
      setImages((prev) => [...prev, img]),
    );
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();

    // Get drop position relative to the stage
    const stage = stageRef.current;
    if (stage) {
      const container = stage.container();
      const rect = container.getBoundingClientRect();
      const dropPosition = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      handleFileUpload(e.dataTransfer.files, dropPosition);
    } else {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // Note: Overlapping detection has been removed in favor of explicit "Combine Images" action
  // Users can now manually combine images via the context menu before running generation

  const { generatingSlot, handleRun } = useAgentGeneration({
    projectId,
    images,
    videos,
    generationSettings,
    startAgentRun,
    agentStatus,
  });

  const handleRemoveBackground = async () => {
    await handleRemoveBackgroundHandler({
      images,
      selectedIds,
      setImages,
      toast: toast.add,
      saveToHistory,
      removeBackground,
      falClient,
    });
  };

  const {
    isolateTarget,
    setIsolateTarget,
    isolateInputValue,
    setIsolateInputValue,
    isIsolating,
    handleIsolate,
  } = useIsolateObject({
    images,
    setImages,
    setSelectedIds,
    saveToHistory,
    falClient,
    isolateObject,
    toast,
  });

  const {
    activeVideoGenerations,
    handleConvertToVideo,
    handleVideoToVideo,
    handleExtendVideo,
    handleRemoveVideoBackground,
    isImageToVideoDialogOpen,
    setIsImageToVideoDialogOpen,
    selectedImageForVideo,
    setSelectedImageForVideo,
    isConvertingToVideo,
    handleImageToVideoConversion,
    isVideoToVideoDialogOpen,
    setIsVideoToVideoDialogOpen,
    selectedVideoForVideo,
    setSelectedVideoForVideo,
    isTransformingVideo,
    handleVideoToVideoTransformation,
    isExtendVideoDialogOpen,
    setIsExtendVideoDialogOpen,
    selectedVideoForExtend,
    setSelectedVideoForExtend,
    isExtendingVideo,
    handleVideoExtension,
    isRemoveVideoBackgroundDialogOpen,
    setIsRemoveVideoBackgroundDialogOpen,
    selectedVideoForBackgroundRemoval,
    setSelectedVideoForBackgroundRemoval,
    isRemovingVideoBackground,
    handleVideoBackgroundRemoval,
    handleVideoGenerationComplete,
    handleVideoGenerationError,
    handleVideoGenerationProgress,
  } = useVideoGenerationPipeline({
    images,
    videos,
    setVideos,
    saveToHistory,
    toast,
    falClient,
    userId: user?.id,
    sessionId,
    refetchCredits,
    viewport,
    canvasSize,
  });

  // Use custom hooks for canvas operations
  const { handleAssetNavigation, handleAssetSelect } = useCanvasAssets({
    images,
    videos,
    viewport,
    canvasSize,
    setViewport,
    setSelectedIds,
  });

  const {
    handleDelete,
    handleDuplicate,
    sendToFront,
    sendToBack,
    bringForward,
    sendBackward,
  } = useCanvasActions({
    images,
    videos,
    selectedIds,
    setImages,
    setVideos,
    setSelectedIds,
    saveToHistory,
  });

  const { handleCombineImages } = useImageOperations({
    images,
    selectedIds,
    setImages,
    setSelectedIds,
    saveToHistory,
  });

  // Use snapping hook
  const { guideLines, getSnapping, updateGuideLines, clearGuideLines } =
    useCanvasSnapping(images, videos, canvasSize, viewport);

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

  return (
    <div
      className="bg-background text-foreground font-focal relative flex flex-row w-full overflow-hidden h-screen"
      style={{ height: "100dvh" }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={(e) => e.preventDefault()}
      onDragLeave={(e) => e.preventDefault()}
    >
      <CanvasLeftSidebar
        images={images}
        videos={videos}
        selectedIds={selectedIds}
        onAssetClick={handleAssetNavigation}
        onAssetSelect={handleAssetSelect}
        projectName={projectName}
        folderName={folderName}
        history={history}
        historyIndex={historyIndex}
        onRestoreHistory={restoreHistory}
      />

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Main content */}
        <main className="flex-1 relative flex items-center justify-center w-full">
          <div className="relative w-full h-full">
            {/* Gradient Overlays */}
            <div
              className="pointer-events-none absolute top-0 left-0 right-0 h-24 bg-linear-to-b from-background to-transparent z-10"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-background to-transparent z-10"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute top-0 bottom-0 left-0 w-24 bg-linear-to-r from-background to-transparent z-10"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute top-0 bottom-0 right-0 w-24 bg-linear-to-l from-background to-transparent z-10"
              aria-hidden="true"
            />
            <ContextMenu
              onOpenChange={(open) => {
                if (!open) {
                  // Reset isolate state when context menu closes
                  setIsolateTarget(null);
                  setIsolateInputValue("");
                }
              }}
            >
              <ContextMenuTrigger>
                <div
                  className="relative bg-background overflow-hidden w-full h-full"
                  style={{
                    // Use consistent style property names to avoid hydration errors
                    height: `${canvasSize.height}px`,
                    width: `${canvasSize.width}px`,
                    minHeight: `${canvasSize.height}px`,
                    minWidth: `${canvasSize.width}px`,
                    cursor: isPanningCanvas ? "grabbing" : "default",
                    WebkitTouchCallout: "none", // Add this for iOS
                    touchAction: "none", // For touch devices
                  }}
                >
                  {isCanvasReady && isStorageLoaded && (
                    <Stage
                      ref={stageRef}
                      width={canvasSize.width}
                      height={canvasSize.height}
                      x={viewport.x}
                      y={viewport.y}
                      scaleX={viewport.scale}
                      scaleY={viewport.scale}
                      draggable={false}
                      onDragStart={(e) => {
                        e.evt?.preventDefault();
                      }}
                      onDragEnd={(e) => {
                        e.evt?.preventDefault();
                      }}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseLeave}
                      onTouchStart={handleTouchStart}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onContextMenu={(e) => {
                        // Check if this is a forwarded event from a video overlay
                        const videoId =
                          (e.evt as any)?.videoId || (e as any)?.videoId;
                        if (videoId) {
                          // This is a right-click on a video
                          if (!selectedIds.includes(videoId)) {
                            setSelectedIds([videoId]);
                          }
                          return;
                        }

                        // Get clicked position
                        const stage = e.target.getStage();
                        if (!stage) return;

                        const point = stage.getPointerPosition();
                        if (!point) return;

                        // Convert to canvas coordinates
                        const canvasPoint = {
                          x: (point.x - viewport.x) / viewport.scale,
                          y: (point.y - viewport.y) / viewport.scale,
                        };

                        // Check if we clicked on a video first (check in reverse order for top-most)
                        const clickedVideo = [...videos]
                          .reverse()
                          .find((vid) => {
                            return (
                              canvasPoint.x >= vid.x &&
                              canvasPoint.x <= vid.x + vid.width &&
                              canvasPoint.y >= vid.y &&
                              canvasPoint.y <= vid.y + vid.height
                            );
                          });

                        if (clickedVideo) {
                          if (!selectedIds.includes(clickedVideo.id)) {
                            setSelectedIds([clickedVideo.id]);
                          }
                          return;
                        }

                        // Check if we clicked on an image (check in reverse order for top-most image)
                        const clickedImage = [...images]
                          .reverse()
                          .find((img) => {
                            // Simple bounding box check
                            // TODO: Could be improved to handle rotation
                            return (
                              canvasPoint.x >= img.x &&
                              canvasPoint.x <= img.x + img.width &&
                              canvasPoint.y >= img.y &&
                              canvasPoint.y <= img.y + img.height
                            );
                          });

                        if (clickedImage) {
                          if (!selectedIds.includes(clickedImage.id)) {
                            // If clicking on unselected image, select only that image
                            setSelectedIds([clickedImage.id]);
                          }
                          // If already selected, keep current selection for multi-select context menu
                        }
                      }}
                      onWheel={handleWheel}
                    >
                      <Layer>
                        {/* Grid background */}
                        {showGrid && (
                          <CanvasGrid
                            viewport={viewport}
                            canvasSize={canvasSize}
                          />
                        )}

                        {/* Selection box */}
                        <SelectionBoxComponent selectionBox={selectionBox} />

                        {/* Render generating placeholders for videos */}
                        {videos
                          .filter((video) => {
                            // Check if this video is being generated
                            return Array.from(
                              activeVideoGenerations.values(),
                            ).some(
                              (gen) =>
                                gen.sourceVideoId === video.id ||
                                gen.sourceImageId === video.id,
                            );
                          })
                          .map((video) => (
                            <GeneratingPlaceholder
                              key={`placeholder-${video.id}`}
                              image={video}
                              outputType="video"
                            />
                          ))}
                        {/* Agent-driven in-canvas loading animation. Shown at the
                            slot reserved on click (correctly sized, non-overlapping),
                            where the finished asset will land. */}
                        {generatingSlot && (
                          <GeneratingPlaceholder
                            image={{
                              id: "agent-placeholder",
                              src: "",
                              rotation: 0,
                              x: generatingSlot.x,
                              y: generatingSlot.y,
                              width: generatingSlot.width,
                              height: generatingSlot.height,
                            }}
                            outputType={generatingSlot.kind}
                            state="running"
                          />
                        )}

                        {/* Render images */}
                        {images
                          .filter((image) => {
                            // Performance optimization: only render visible images
                            const buffer = 100; // pixels buffer
                            const viewBounds = {
                              left: -viewport.x / viewport.scale - buffer,
                              top: -viewport.y / viewport.scale - buffer,
                              right:
                                (canvasSize.width - viewport.x) /
                                  viewport.scale +
                                buffer,
                              bottom:
                                (canvasSize.height - viewport.y) /
                                  viewport.scale +
                                buffer,
                            };

                            return !(
                              image.x + image.width < viewBounds.left ||
                              image.x > viewBounds.right ||
                              image.y + image.height < viewBounds.top ||
                              image.y > viewBounds.bottom
                            );
                          })
                          .map((image) => (
                            <CanvasImage
                              key={image.id}
                              image={image}
                              isSelected={selectedIds.includes(image.id)}
                              onSelect={(e) => handleSelect(image.id, e)}
                              onChange={(newAttrs) => {
                                setImages((prev) =>
                                  prev.map((img) =>
                                    img.id === image.id
                                      ? { ...img, ...newAttrs }
                                      : img,
                                  ),
                                );
                              }}
                              onDragMove={(e, newAttrs) => {
                                // Apply snapping during drag
                                const updatedImage = { ...image, ...newAttrs };
                                const snapping = getSnapping(updatedImage);

                                if (snapping.guides.length > 0) {
                                  updateGuideLines(snapping.guides);

                                  // Apply snapping to the dragged image
                                  const snappedAttrs = {
                                    ...newAttrs,
                                    ...(snapping.snappedX !== undefined && {
                                      x: snapping.snappedX,
                                    }),
                                    ...(snapping.snappedY !== undefined && {
                                      y: snapping.snappedY,
                                    }),
                                  };

                                  setImages((prev) =>
                                    prev.map((img) =>
                                      img.id === image.id
                                        ? { ...img, ...snappedAttrs }
                                        : img,
                                    ),
                                  );

                                  // Update other selected items with the same delta
                                  if (selectedIds.length > 1) {
                                    const deltaX =
                                      (snappedAttrs.x ??
                                        newAttrs.x ??
                                        image.x) - image.x;
                                    const deltaY =
                                      (snappedAttrs.y ??
                                        newAttrs.y ??
                                        image.y) - image.y;

                                    setImages((prev) =>
                                      prev.map((img) => {
                                        if (
                                          selectedIds.includes(img.id) &&
                                          img.id !== image.id
                                        ) {
                                          const startPos =
                                            dragStartPositions.get(img.id);
                                          if (startPos) {
                                            return {
                                              ...img,
                                              x: startPos.x + deltaX,
                                              y: startPos.y + deltaY,
                                            };
                                          }
                                        }
                                        return img;
                                      }),
                                    );
                                  }

                                  // Return the snapped coordinates to update the Konva node
                                  return snappedAttrs;
                                } else {
                                  clearGuideLines();
                                  setImages((prev) =>
                                    prev.map((img) =>
                                      img.id === image.id
                                        ? { ...img, ...newAttrs }
                                        : img,
                                    ),
                                  );
                                  // Return the new attributes to update the Konva node
                                  return newAttrs;
                                }
                              }}
                              onDoubleClick={() => {
                                setCroppingImageId(image.id);
                              }}
                              onDragStart={() => {
                                // If dragging a selected item in a multi-selection, keep the selection
                                // If dragging an unselected item, select only that item
                                let currentSelectedIds = selectedIds;
                                if (!selectedIds.includes(image.id)) {
                                  currentSelectedIds = [image.id];
                                  setSelectedIds(currentSelectedIds);
                                }

                                setIsDraggingImage(true);
                                // Save positions of all selected items
                                const positions = new Map<
                                  string,
                                  { x: number; y: number }
                                >();
                                currentSelectedIds.forEach((id) => {
                                  const img = images.find((i) => i.id === id);
                                  if (img) {
                                    positions.set(id, { x: img.x, y: img.y });
                                  }
                                });
                                setDragStartPositions(positions);
                              }}
                              onDragEnd={() => {
                                setIsDraggingImage(false);
                                clearGuideLines();
                                saveToHistory();
                                setDragStartPositions(new Map());
                              }}
                              selectedIds={selectedIds}
                              images={images}
                              setImages={setImages}
                              isDraggingImage={isDraggingImage}
                              isCroppingImage={croppingImageId === image.id}
                              dragStartPositions={dragStartPositions}
                            />
                          ))}

                        {/* Render videos */}
                        {videos
                          .filter((video) => {
                            // Performance optimization: only render visible videos
                            const buffer = 100; // pixels buffer
                            const viewBounds = {
                              left: -viewport.x / viewport.scale - buffer,
                              top: -viewport.y / viewport.scale - buffer,
                              right:
                                (canvasSize.width - viewport.x) /
                                  viewport.scale +
                                buffer,
                              bottom:
                                (canvasSize.height - viewport.y) /
                                  viewport.scale +
                                buffer,
                            };

                            return !(
                              video.x + video.width < viewBounds.left ||
                              video.x > viewBounds.right ||
                              video.y + video.height < viewBounds.top ||
                              video.y > viewBounds.bottom
                            );
                          })
                          .map((video) => (
                            <CanvasVideo
                              key={video.id}
                              video={video}
                              isSelected={selectedIds.includes(video.id)}
                              onSelect={(e) => handleSelect(video.id, e)}
                              onChange={(newAttrs) => {
                                setVideos((prev) =>
                                  prev.map((vid) =>
                                    vid.id === video.id
                                      ? { ...vid, ...newAttrs }
                                      : vid,
                                  ),
                                );
                              }}
                              onDragMove={(e, newAttrs) => {
                                // Apply snapping during drag
                                const updatedVideo = { ...video, ...newAttrs };
                                const snapping = getSnapping(updatedVideo);

                                if (snapping.guides.length > 0) {
                                  updateGuideLines(snapping.guides);

                                  // Apply snapping to the dragged video
                                  const snappedAttrs = {
                                    ...newAttrs,
                                    ...(snapping.snappedX !== undefined && {
                                      x: snapping.snappedX,
                                    }),
                                    ...(snapping.snappedY !== undefined && {
                                      y: snapping.snappedY,
                                    }),
                                  };

                                  setVideos((prev) =>
                                    prev.map((vid) =>
                                      vid.id === video.id
                                        ? { ...vid, ...snappedAttrs }
                                        : vid,
                                    ),
                                  );

                                  // Update other selected items with the same delta
                                  if (selectedIds.length > 1) {
                                    const deltaX =
                                      (snappedAttrs.x ??
                                        newAttrs.x ??
                                        video.x) - video.x;
                                    const deltaY =
                                      (snappedAttrs.y ??
                                        newAttrs.y ??
                                        video.y) - video.y;

                                    setVideos((prev) =>
                                      prev.map((vid) => {
                                        if (
                                          selectedIds.includes(vid.id) &&
                                          vid.id !== video.id
                                        ) {
                                          const startPos =
                                            dragStartPositions.get(vid.id);
                                          if (startPos) {
                                            return {
                                              ...vid,
                                              x: startPos.x + deltaX,
                                              y: startPos.y + deltaY,
                                            };
                                          }
                                        }
                                        return vid;
                                      }),
                                    );
                                  }

                                  // Return the snapped coordinates to update the Konva node
                                  return snappedAttrs;
                                } else {
                                  clearGuideLines();
                                  setVideos((prev) =>
                                    prev.map((vid) =>
                                      vid.id === video.id
                                        ? { ...vid, ...newAttrs }
                                        : vid,
                                    ),
                                  );
                                  // Return the new attributes to update the Konva node
                                  return newAttrs;
                                }
                              }}
                              onDragStart={() => {
                                // If dragging a selected item in a multi-selection, keep the selection
                                // If dragging an unselected item, select only that item
                                let currentSelectedIds = selectedIds;
                                if (!selectedIds.includes(video.id)) {
                                  currentSelectedIds = [video.id];
                                  setSelectedIds(currentSelectedIds);
                                }

                                setIsDraggingImage(true);
                                // Hide video controls during drag
                                setHiddenVideoControlsIds(
                                  (prev) => new Set([...prev, video.id]),
                                );
                                // Save positions of all selected items
                                const positions = new Map<
                                  string,
                                  { x: number; y: number }
                                >();
                                currentSelectedIds.forEach((id) => {
                                  const vid = videos.find((v) => v.id === id);
                                  if (vid) {
                                    positions.set(id, { x: vid.x, y: vid.y });
                                  }
                                });
                                setDragStartPositions(positions);
                              }}
                              onDragEnd={() => {
                                setIsDraggingImage(false);
                                clearGuideLines();
                                // Show video controls after drag ends
                                setHiddenVideoControlsIds((prev) => {
                                  const newSet = new Set(prev);
                                  newSet.delete(video.id);
                                  return newSet;
                                });
                                saveToHistory();
                                setDragStartPositions(new Map());
                              }}
                              selectedIds={selectedIds}
                              videos={videos}
                              setVideos={setVideos}
                              isDraggingVideo={isDraggingImage}
                              isCroppingVideo={false}
                              dragStartPositions={dragStartPositions}
                              onResizeStart={() =>
                                setHiddenVideoControlsIds(
                                  (prev) => new Set([...prev, video.id]),
                                )
                              }
                              onResizeEnd={() =>
                                setHiddenVideoControlsIds((prev) => {
                                  const newSet = new Set(prev);
                                  newSet.delete(video.id);
                                  return newSet;
                                })
                              }
                            />
                          ))}

                        {/* Snap guide lines - rendered after images/videos to appear on top */}
                        <SnapGuideLines guides={guideLines} />

                        {/* Crop overlay */}
                        {croppingImageId &&
                          (() => {
                            const croppingImage = images.find(
                              (img) => img.id === croppingImageId,
                            );
                            if (!croppingImage) return null;

                            return (
                              <CropOverlayWrapper
                                image={croppingImage}
                                viewportScale={viewport.scale}
                                onCropChange={(crop) => {
                                  setImages((prev) =>
                                    prev.map((img) =>
                                      img.id === croppingImageId
                                        ? { ...img, ...crop }
                                        : img,
                                    ),
                                  );
                                }}
                                onCropEnd={async () => {
                                  // Apply crop to image dimensions
                                  if (croppingImage) {
                                    const cropWidth =
                                      croppingImage.cropWidth || 1;
                                    const cropHeight =
                                      croppingImage.cropHeight || 1;
                                    const cropX = croppingImage.cropX || 0;
                                    const cropY = croppingImage.cropY || 0;

                                    try {
                                      // Create the cropped image at full resolution
                                      const croppedImageSrc =
                                        await createCroppedImage(
                                          croppingImage.src,
                                          cropX,
                                          cropY,
                                          cropWidth,
                                          cropHeight,
                                        );

                                      setImages((prev) =>
                                        prev.map((img) =>
                                          img.id === croppingImageId
                                            ? {
                                                ...img,
                                                // Replace with cropped image
                                                src: croppedImageSrc,
                                                // Update position to the crop area's top-left
                                                x: img.x + cropX * img.width,
                                                y: img.y + cropY * img.height,
                                                // Update dimensions to match crop size
                                                width: cropWidth * img.width,
                                                height: cropHeight * img.height,
                                                // Remove crop values completely
                                                cropX: undefined,
                                                cropY: undefined,
                                                cropWidth: undefined,
                                                cropHeight: undefined,
                                              }
                                            : img,
                                        ),
                                      );
                                    } catch (error) {
                                      console.error(
                                        "Failed to create cropped image:",
                                        error,
                                      );
                                    }
                                  }

                                  setCroppingImageId(null);
                                  saveToHistory();
                                }}
                              />
                            );
                          })()}
                      </Layer>
                    </Stage>
                  )}
                </div>
              </ContextMenuTrigger>
              <CanvasContextMenu
                selectedIds={selectedIds}
                images={images}
                videos={videos}
                isGenerating={false}
                generationSettings={generationSettings}
                isolateInputValue={isolateInputValue}
                isIsolating={isIsolating}
                handleRun={handleRun}
                handleDuplicate={handleDuplicate}
                handleRemoveBackground={handleRemoveBackground}
                handleCombineImages={handleCombineImages}
                handleDelete={handleDelete}
                handleIsolate={handleIsolate}
                handleConvertToVideo={handleConvertToVideo}
                handleVideoToVideo={handleVideoToVideo}
                handleExtendVideo={handleExtendVideo}
                handleRemoveVideoBackground={handleRemoveVideoBackground}
                setCroppingImageId={setCroppingImageId}
                setIsolateInputValue={setIsolateInputValue}
                setIsolateTarget={setIsolateTarget}
                sendToFront={sendToFront}
                sendToBack={sendToBack}
                bringForward={bringForward}
                sendBackward={sendBackward}
              />
            </ContextMenu>

            <div className="absolute top-4 left-4 z-20 flex flex-col items-start gap-2">
              {/* Mobile tool icons - animated based on selection */}
              <MobileToolbar
                selectedIds={selectedIds}
                images={images}
                isGenerating={false}
                generationSettings={generationSettings}
                handleRun={handleRun}
                handleDuplicate={handleDuplicate}
                handleRemoveBackground={handleRemoveBackground}
                handleCombineImages={handleCombineImages}
                handleDelete={handleDelete}
                setCroppingImageId={setCroppingImageId}
                sendToFront={sendToFront}
                sendToBack={sendToBack}
                bringForward={bringForward}
                sendBackward={sendBackward}
              />
            </div>

            {/* Undo/Redo and Settings - Top Right */}
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
              {/* Credit Badge */}
              {user && (
                <div
                  className={cn(
                    "rounded-xl overflow-clip flex items-center gap-1.5 px-3 py-1.5 border border-border",
                    "shadow-[0_0_0_1px_rgba(50,50,50,0.12),0_4px_8px_-0.5px_rgba(50,50,50,0.04),0_8px_16px_-2px_rgba(50,50,50,0.02)]",
                    "bg-card/95 backdrop-blur-lg",
                  )}
                  title="Available credits"
                >
                  <DiamondsFourIcon
                    size={14}
                    weight="fill"
                    className="text-teal-500"
                  />
                  <NumberFlow
                    value={userCredits}
                    className="text-sm font-semibold tabular-nums"
                  />
                </div>
              )}

              <div
                className={cn(
                  "rounded-xl overflow-clip flex items-center border border-border",
                  "shadow-[0_0_0_1px_rgba(50,50,50,0.12),0_4px_8px_-0.5px_rgba(50,50,50,0.04),0_8px_16px_-2px_rgba(50,50,50,0.02)]",
                  "bg-card/95 backdrop-blur-lg",
                )}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={undo}
                  disabled={!canUndo}
                  className="rounded-none"
                  title="Undo"
                >
                  <Undo className="h-4 w-4" />
                </Button>
                <div className="h-6 w-px bg-border" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={redo}
                  disabled={!canRedo}
                  className="rounded-none"
                  title="Redo"
                >
                  <Redo className="h-4 w-4" strokeWidth={2} />
                </Button>
              </div>

              <SettingsDialog
                showGrid={showGrid}
                setShowGrid={setShowGrid}
                canvasStorage={canvasStorage}
                setImages={setImages}
                setViewport={setViewport}
                toast={toast}
              />
            </div>

            {/* Prompt Editor */}
            <PromptEditor
              ref={promptEditorRef}
              generationSettings={generationSettings}
              setGenerationSettings={setGenerationSettings}
              selectedIds={selectedIds}
              images={images}
              isGenerating={false}
              // ponytail: legacy streaming path deleted; wire agentStatus here when the Run button should reflect runs.
              generationState="running"
              handleRun={handleRun}
              handleFileUpload={handleFileUpload}
              toast={toast}
              onAssetReferencesChange={onAssetReferencesChange}
            />

            {/* Zoom controls */}
            <ZoomControls
              viewport={viewport}
              setViewport={setViewport}
              canvasSize={canvasSize}
            />

            {/* Dimension display for selected images */}
            <DimensionDisplay
              selectedImages={images.filter((img) =>
                selectedIds.includes(img.id),
              )}
              viewport={viewport}
              isDragging={isDraggingImage}
            />
          </div>
        </main>

        {/* Image to Video Dialog */}
        <ImageToVideoDialog
          isOpen={isImageToVideoDialogOpen}
          onClose={() => {
            setIsImageToVideoDialogOpen(false);
            setSelectedImageForVideo(null);
          }}
          onConvert={handleImageToVideoConversion}
          imageUrl={
            selectedImageForVideo
              ? images.find((img) => img.id === selectedImageForVideo)?.src ||
                ""
              : ""
          }
          isConverting={isConvertingToVideo}
        />

        <VideoToVideoDialog
          isOpen={isVideoToVideoDialogOpen}
          onClose={() => {
            setIsVideoToVideoDialogOpen(false);
            setSelectedVideoForVideo(null);
          }}
          onConvert={handleVideoToVideoTransformation}
          videoUrl={
            selectedVideoForVideo
              ? videos.find((vid) => vid.id === selectedVideoForVideo)?.src ||
                ""
              : ""
          }
          isConverting={isTransformingVideo}
        />

        <ExtendVideoDialog
          isOpen={isExtendVideoDialogOpen}
          onClose={() => {
            setIsExtendVideoDialogOpen(false);
            setSelectedVideoForExtend(null);
          }}
          onExtend={handleVideoExtension}
          videoUrl={
            selectedVideoForExtend
              ? videos.find((vid) => vid.id === selectedVideoForExtend)?.src ||
                ""
              : ""
          }
          isExtending={isExtendingVideo}
        />

        <RemoveVideoBackgroundDialog
          isOpen={isRemoveVideoBackgroundDialogOpen}
          onClose={() => {
            setIsRemoveVideoBackgroundDialogOpen(false);
            setSelectedVideoForBackgroundRemoval(null);
          }}
          onProcess={handleVideoBackgroundRemoval}
          videoUrl={
            selectedVideoForBackgroundRemoval
              ? videos.find(
                  (vid) => vid.id === selectedVideoForBackgroundRemoval,
                )?.src || ""
              : ""
          }
          videoDuration={
            selectedVideoForBackgroundRemoval
              ? videos.find(
                  (vid) => vid.id === selectedVideoForBackgroundRemoval,
                )?.duration || 0
              : 0
          }
          isProcessing={isRemovingVideoBackground}
        />

        {/* Video Generation Streaming Components */}
        {Array.from(activeVideoGenerations.entries()).map(
          ([id, generation]) => (
            <StreamingVideo
              key={id}
              videoId={id}
              generation={generation}
              onComplete={handleVideoGenerationComplete}
              onError={handleVideoGenerationError}
              onProgress={handleVideoGenerationProgress}
            />
          ),
        )}

        {/* Video Controls Overlays */}
        <VideoOverlays
          videos={videos}
          selectedIds={selectedIds}
          viewport={viewport}
          hiddenVideoControlsIds={hiddenVideoControlsIds}
          setVideos={setVideos}
        />
      </div>
    </div>
  );
}
