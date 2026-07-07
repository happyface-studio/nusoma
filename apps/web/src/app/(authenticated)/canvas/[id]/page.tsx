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
import { getVideoModelById } from "@/lib/models-config";

// Import types
import type {
  PlacedImage,
  PlacedVideo,
  GenerationSettings,
  VideoGenerationSettings,
  ActiveVideoGeneration,
} from "@/types/canvas";

import { createCroppedImage, uploadFilesAsImages } from "@/utils/canvas-utils";
import { convertImageToVideo } from "@/utils/video-utils";

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
import { findOpenSpot, dimsForOutput, type Rect } from "@/lib/canvas-placement";

// Import handlers
import { handleRemoveBackground as handleRemoveBackgroundHandler } from "@/lib/handlers/background-handler";
import { useParams } from "next/navigation";

export default function OverlayPage() {
  const { user, sessionId } = useAuth();
  const params = useParams();
  const projectId = params?.id as string;
  const { start: startAgentRun, status: agentStatus } = useAgentRun();
  // The single slot reserved for the current agent run: drives the in-canvas
  // loading placeholder AND is sent to the server so the asset lands in the exact
  // same spot. null when no run is in flight.
  const [generatingSlot, setGeneratingSlot] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    kind: "image" | "video";
  } | null>(null);
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
  const [activeVideoGenerations, setActiveVideoGenerations] = useState<
    Map<string, ActiveVideoGeneration>
  >(new Map());
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
  const [isImageToVideoDialogOpen, setIsImageToVideoDialogOpen] =
    useState(false);
  const [selectedImageForVideo, setSelectedImageForVideo] = useState<
    string | null
  >(null);
  const [isConvertingToVideo, setIsConvertingToVideo] = useState(false);
  const [isVideoToVideoDialogOpen, setIsVideoToVideoDialogOpen] =
    useState(false);
  const [selectedVideoForVideo, setSelectedVideoForVideo] = useState<
    string | null
  >(null);
  const [isTransformingVideo, setIsTransformingVideo] = useState(false);
  const [isExtendVideoDialogOpen, setIsExtendVideoDialogOpen] = useState(false);
  const [selectedVideoForExtend, setSelectedVideoForExtend] = useState<
    string | null
  >(null);
  const [isExtendingVideo, setIsExtendingVideo] = useState(false);
  const [
    isRemoveVideoBackgroundDialogOpen,
    setIsRemoveVideoBackgroundDialogOpen,
  ] = useState(false);
  const [
    selectedVideoForBackgroundRemoval,
    setSelectedVideoForBackgroundRemoval,
  ] = useState<string | null>(null);
  const [isRemovingVideoBackground, setIsRemovingVideoBackground] =
    useState(false);

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

  // Function to handle the "Convert to Video" option in the context menu
  const handleConvertToVideo = (imageId: string) => {
    const image = images.find((img) => img.id === imageId);
    if (!image) return;

    setSelectedImageForVideo(imageId);
    setIsImageToVideoDialogOpen(true);
  };

  // Function to handle the image-to-video conversion
  const handleImageToVideoConversion = async (
    settings: VideoGenerationSettings,
  ) => {
    if (!selectedImageForVideo) return;

    const image = images.find((img) => img.id === selectedImageForVideo);
    if (!image) return;

    try {
      setIsConvertingToVideo(true);

      // Upload image if it's a data URL
      let imageUrl = image.src;
      if (imageUrl.startsWith("data:")) {
        const uploadResult = await falClient.storage.upload(
          await (await fetch(imageUrl)).blob(),
        );
        imageUrl = uploadResult;
      }

      // Create a unique ID for this generation
      const generationId = `img2vid_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Get video model name for toast display
      let modelName = "Video Model";
      const modelId = settings.modelId || "ltx-video";
      const { getVideoModelById } = await import("@/lib/models-config");
      const model = getVideoModelById(modelId);
      if (model) {
        modelName = model.name;
      }

      // Close the dialog
      setIsImageToVideoDialogOpen(false);

      // Clear the converting flag since it's now tracked in activeVideoGenerations
      setIsConvertingToVideo(false);

      // Create a promise that tracks the video generation
      const generationPromise = new Promise<string>((resolve, reject) => {
        // Add to active generations with promise handlers
        setActiveVideoGenerations((prev) => {
          const newMap = new Map(prev);
          newMap.set(generationId, {
            imageUrl,
            prompt: settings.prompt || "",
            duration: settings.duration || 5,
            modelId: settings.modelId,
            resolution: settings.resolution || "720p",
            cameraFixed: settings.cameraFixed,
            seed: settings.seed,
            sourceImageId: selectedImageForVideo,
            promiseResolve: resolve,
            promiseReject: reject,
          });
          return newMap;
        });
      });

      toast.promise(generationPromise, {
        loading: {
          title: "Generating video",
          description: `${modelName} - ${settings.duration || 5}s - ${settings.resolution || "720p"}`,
        },
        success: {
          title: "Video generated",
          description: "The video has been added to your canvas",
        },
        error: (err: Error) => ({
          title: "Generation failed",
          description: err.message,
        }),
      });
    } catch (error) {
      console.error("Error starting image-to-video conversion:", error);
      toast.add({
        title: "Conversion failed",
        description:
          error instanceof Error ? error.message : "Failed to start conversion",
        type: "error",
      });
      setIsConvertingToVideo(false);
    }
  };

  // Function to handle the "Video to Video" option in the context menu
  const handleVideoToVideo = (videoId: string) => {
    const video = videos.find((vid) => vid.id === videoId);
    if (!video) return;

    setSelectedVideoForVideo(videoId);
    setIsVideoToVideoDialogOpen(true);
  };

  // Function to handle the video-to-video transformation
  const handleVideoToVideoTransformation = async (
    settings: VideoGenerationSettings,
  ) => {
    if (!selectedVideoForVideo) return;

    const video = videos.find((vid) => vid.id === selectedVideoForVideo);
    if (!video) return;

    try {
      setIsTransformingVideo(true);

      // Upload video if it's a data URL or local file
      let videoUrl = video.src;
      if (videoUrl.startsWith("data:") || videoUrl.startsWith("blob:")) {
        const uploadResult = await falClient.storage.upload(
          await (await fetch(videoUrl)).blob(),
        );
        videoUrl = uploadResult;
      }

      // Create a unique ID for this generation
      const generationId = `vid2vid_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Get video model name for toast display
      let modelName = "Video Model";
      const { getVideoModelById, getVideoModelForCategory } =
        await import("@/lib/models-config");

      const defaultModel = getVideoModelForCategory("video-to-video");
      const modelId = settings.modelId || defaultModel?.id;

      const model = getVideoModelById(modelId);
      if (model) {
        modelName = model.name;
      }

      // Close the dialog
      setIsVideoToVideoDialogOpen(false);

      // Create a promise that tracks the video generation
      const generationPromise = new Promise<string>((resolve, reject) => {
        // Add to active generations with promise handlers
        setActiveVideoGenerations((prev) => {
          const newMap = new Map(prev);
          newMap.set(generationId, {
            ...settings,
            imageUrl: videoUrl,
            duration: video.duration || settings.duration || 5,
            modelId: modelId,
            resolution: settings.resolution || "720p",
            isVideoToVideo: true,
            sourceVideoId: selectedVideoForVideo,
            promiseResolve: resolve,
            promiseReject: reject,
            userId: user?.id,
            sessionId: sessionId,
          });
          return newMap;
        });
      });

      // Use Base UI's native toast.promise
      toast.promise(generationPromise, {
        loading: {
          title: "Transforming video",
          description: `${modelName} - ${settings.resolution || "Default"}`,
        },
        success: {
          title: "Video transformed",
          description: "The transformed video has been added to your canvas",
        },
        error: (err: Error) => ({
          title: "Transformation failed",
          description: err.message,
        }),
      });
    } catch (error) {
      console.error("Error starting video-to-video transformation:", error);
      toast.add({
        title: "Transformation failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to start transformation",
        type: "error",
      });
      setIsTransformingVideo(false);
    }
  };

  // Function to handle the "Extend Video" option in the context menu
  const handleExtendVideo = (videoId: string) => {
    const video = videos.find((vid) => vid.id === videoId);
    if (!video) return;

    setSelectedVideoForExtend(videoId);
    setIsExtendVideoDialogOpen(true);
  };

  // Function to handle the video extension
  const handleVideoExtension = async (settings: VideoGenerationSettings) => {
    if (!selectedVideoForExtend) return;

    const video = videos.find((vid) => vid.id === selectedVideoForExtend);
    if (!video) return;

    try {
      setIsExtendingVideo(true);

      // Upload video if it's a data URL or local file
      let videoUrl = video.src;
      if (videoUrl.startsWith("data:") || videoUrl.startsWith("blob:")) {
        const uploadResult = await falClient.storage.upload(
          await (await fetch(videoUrl)).blob(),
        );
        videoUrl = uploadResult;
      }

      // Create a unique ID for this generation
      const generationId = `vid_ext_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Get video model name for toast display
      let modelName = "Video Model";
      const { getVideoModelById } = await import("@/lib/models-config");
      const model = getVideoModelById(settings.modelId);
      if (model) {
        modelName = model.name;
      }

      // Close the dialog
      setIsExtendVideoDialogOpen(false);

      // Create a promise that tracks the video extension
      const generationPromise = new Promise<string>((resolve, reject) => {
        // Add to active generations with promise handlers
        setActiveVideoGenerations((prev) => {
          const newMap = new Map(prev);
          newMap.set(generationId, {
            ...settings,
            imageUrl: videoUrl,
            duration: video.duration || settings.duration || 5,
            modelId: settings.modelId,
            resolution: settings.resolution || "720p",
            isVideoToVideo: true,
            isVideoExtension: true,
            sourceVideoId: selectedVideoForExtend,
            promiseResolve: resolve,
            promiseReject: reject,
          });
          return newMap;
        });
      });

      // Use Base UI's native toast.promise
      toast.promise(generationPromise, {
        loading: {
          title: "Extending video",
          description: `${modelName} - ${settings.resolution || "Default"}`,
        },
        success: {
          title: "Video extended",
          description: "The extended video has been added to your canvas",
        },
        error: (err: Error) => ({
          title: "Extension failed",
          description: err.message,
        }),
      });
    } catch (error) {
      console.error("Error starting video extension:", error);
      toast.add({
        title: "Extension failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to start video extension",
        type: "error",
      });
      setIsExtendingVideo(false);
    }
  };

  // Function to handle video generation completion
  const handleVideoGenerationComplete = async (
    videoId: string,
    videoUrl: string,
    duration: number,
    referencedAssetIds?: string[],
  ) => {
    // Refetch credits after generation completes
    refetchCredits();

    try {
      console.log("Video generation complete:", {
        videoId,
        videoUrl,
        duration,
      });

      // Get the generation data to check for source image ID
      const generation = activeVideoGenerations.get(videoId);
      const isBackgroundRemoval =
        generation?.modelId === "bria-video-background-removal";

      // Check if we already have a placeholder video with this ID (from generation-handler)
      const existingPlaceholderIndex = videos.findIndex(
        (v) => v.id === videoId,
      );

      if (existingPlaceholderIndex !== -1) {
        // Update the existing placeholder
        setVideos((prev) =>
          prev.map((v) => {
            if (v.id === videoId) {
              return {
                ...v,
                src: videoUrl,
                duration: duration,
                isGenerated: false, // Mark as finished generating
                referencedAssetIds: referencedAssetIds || v.referencedAssetIds,
              };
            }
            return v;
          }),
        );

        saveToHistory();

        toast.add({
          title: "Video generated",
          description: "Video has been updated on the canvas.",
        });
      } else {
        // Handle dialog-based generations (where we create a new video relative to source)
        const sourceImageId =
          generation?.sourceImageId || selectedImageForVideo;

        // Find the original image if this was an image-to-video conversion
        if (sourceImageId) {
          const image = images.find((img) => img.id === sourceImageId);
          if (image) {
            // Create a video element based on the original image
            const video = convertImageToVideo(
              image,
              videoUrl,
              duration,
              false, // Don't replace the original image
            );

            // Position the video to the right of the source image
            // Add a small gap between the image and video (20px)
            video.x = image.x + image.width + 20;
            video.y = image.y; // Keep the same vertical position

            // Add the video to the videos state
            setVideos((prev) => [
              ...prev,
              { ...video, isVideo: true as const, referencedAssetIds },
            ]);

            // Save to history
            saveToHistory();

            // Show success toast
            toast.add({
              title: "Video created successfully",
              description:
                "The video has been added to the right of the source image.",
            });
          } else {
            console.error("Source image not found:", sourceImageId);
            toast.add({
              title: "Error creating video",
              description: "The source image could not be found.",
              type: "error",
            });
          }
        } else if (generation?.sourceVideoId || generation?.isVideoToVideo) {
          // This was a video-to-video transformation or extension
          const sourceVideoId =
            generation?.sourceVideoId ||
            selectedVideoForVideo ||
            selectedVideoForExtend;
          const isExtension = generation?.isVideoExtension;

          if (sourceVideoId) {
            const sourceVideo = videos.find((vid) => vid.id === sourceVideoId);
            if (sourceVideo) {
              // Create a new video based on the source video
              const newVideo: PlacedVideo = {
                id: id(), // Use UUID from InstantDB
                src: videoUrl,
                x: sourceVideo.x + sourceVideo.width + 20, // Position to the right
                y: sourceVideo.y,
                width: sourceVideo.width,
                height: sourceVideo.height,
                rotation: 0,
                isPlaying: false,
                currentTime: 0,
                duration: duration,
                volume: 1,
                muted: false,
                isLooping: false,
                isVideo: true as const,
                referencedAssetIds,
              };

              // Add the transformed video to the canvas
              setVideos((prev) => [...prev, newVideo]);

              // Save to history
              saveToHistory();

              // Resolve the promise for toast.promise
              if (generation?.promiseResolve) {
                if (isExtension) {
                  generation.promiseResolve(
                    "The extended video has been added to the right of the source video.",
                  );
                } else if (
                  generation?.modelId === "bria-video-background-removal"
                ) {
                  generation.promiseResolve(
                    "The video with removed background has been added to the right of the source video.",
                  );
                } else {
                  generation.promiseResolve(
                    "The transformed video has been added to the right of the source video.",
                  );
                }
              }
            } else {
              console.error("Source video not found:", sourceVideoId);
              if (generation?.promiseReject) {
                generation.promiseReject(
                  new Error("The source video could not be found."),
                );
              } else {
                toast.add({
                  title: "Error creating video",
                  description: "The source video could not be found.",
                  type: "error",
                });
              }
            }
          }

          // Reset the transformation/extension state
          setIsTransformingVideo(false);
          setSelectedVideoForVideo(null);
          setIsExtendingVideo(false);
          setSelectedVideoForExtend(null);
        } else {
          // This was a text-to-video generation
          // Place in center of viewport
          const newVideo: PlacedVideo = {
            id: id(),
            src: videoUrl,
            x:
              -viewport.x / viewport.scale +
              canvasSize.width / viewport.scale / 2 -
              250, // Approximate center
            y:
              -viewport.y / viewport.scale +
              canvasSize.height / viewport.scale / 2 -
              250,
            width: 500, // Default width
            height: 500, // Default height
            rotation: 0,
            isPlaying: false,
            currentTime: 0,
            duration: duration,
            volume: 1,
            muted: false,
            isLooping: false,
            isVideo: true as const,
            referencedAssetIds,
          };

          setVideos((prev) => [...prev, newVideo]);
          saveToHistory();

          toast.add({
            title: "Video generated",
            description: "Video has been placed on the canvas.",
          });
        }
      }

      // Remove from active generations
      setActiveVideoGenerations((prev) => {
        const newMap = new Map(prev);
        newMap.delete(videoId);
        return newMap;
      });

      // Reset appropriate flags based on generation type
      if (isBackgroundRemoval) {
        setIsRemovingVideoBackground(false);
      } else {
        setIsConvertingToVideo(false);
        setSelectedImageForVideo(null);
      }
    } catch (error) {
      console.error("Error completing video generation:", error);

      // Reject the promise for toast.promise
      const generation = activeVideoGenerations.get(videoId);
      if (generation?.promiseReject) {
        generation.promiseReject(
          error instanceof Error ? error : new Error("Failed to create video"),
        );
      } else {
        // Fallback for generations without promises
        toast.add({
          title: "Error creating video",
          description:
            error instanceof Error ? error.message : "Failed to create video",
          type: "error",
        });
      }

      // Remove from active generations even on error
      setActiveVideoGenerations((prev) => {
        const newMap = new Map(prev);
        newMap.delete(videoId);
        return newMap;
      });

      setIsConvertingToVideo(false);
      setSelectedImageForVideo(null);
    }
  };

  // Function to handle video generation errors
  const handleVideoGenerationError = (videoId: string, error: string) => {
    console.error("Video generation error:", error);

    // Check if this was a background removal
    const generation = activeVideoGenerations.get(videoId);
    const isBackgroundRemoval =
      generation?.modelId === "bria-video-background-removal";

    // Reject the promise for toast.promise
    if (generation?.promiseReject) {
      generation.promiseReject(new Error(error));
    } else {
      // Fallback for generations without promises
      toast.add({
        title: isBackgroundRemoval
          ? "Background removal failed"
          : "Video generation failed",
        description: error,
        type: "error",
      });
    }

    // Remove from active generations
    setActiveVideoGenerations((prev) => {
      const newMap = new Map(prev);
      newMap.delete(videoId);
      return newMap;
    });

    // Reset appropriate flags
    if (isBackgroundRemoval) {
      setIsRemovingVideoBackground(false);
    } else {
      setIsConvertingToVideo(false);
      setIsTransformingVideo(false);
      setIsExtendingVideo(false);
    }
  };

  // Function to handle video generation progress
  const handleVideoGenerationProgress = (
    videoId: string,
    progress: number,
    status: string,
  ) => {
    // You could update a progress indicator here if needed
    console.log(`Video generation progress: ${progress}% - ${status}`);
  };

  const { mutateAsync: isolateObject } = useMutation(
    trpc.isolateObject.mutationOptions(),
  );

  const { mutateAsync: generateTextToImage } = useMutation(
    trpc.generateTextToImage.mutationOptions(),
  );

  // Drive the in-canvas loading animation (GeneratingPlaceholder) from the agent's
  // event stream — one placeholder per `generate` that's been requested but hasn't
  // returned yet. When the generate finishes, the real asset arrives via the
  // reactive merge above and the placeholder count drops back to zero.
  // ponytail: pairs generate requests to results by shape (toolName / assetId /
  // error) and assumes `generate` is the only canvas-affecting tool — true for eve
  // today. Position mirrors persistAgentAsset's stagger so the placeholder lands
  // where the asset will; size defaults to the server's 1024² image default.
  // Clear the reserved slot the moment its asset lands. The server places the
  // asset at the slot's exact position, so an element appearing there is the
  // hand-off signal — the placeholder disappears as the real asset takes its
  // place, with no gap and no jump. findOpenSpot guaranteed the slot was empty at
  // reservation, so nothing else can be sitting there.
  useEffect(() => {
    if (!generatingSlot) return;
    const landed = [...images, ...videos].some(
      (el) =>
        Math.abs(el.x - generatingSlot.x) < 1 &&
        Math.abs(el.y - generatingSlot.y) < 1,
    );
    if (landed) setGeneratingSlot(null);
  }, [images, videos, generatingSlot]);

  // Safety net: never leave a placeholder stuck. On failure clear immediately; on
  // completion give the reactive query a beat to deliver the asset (which clears
  // the slot above) before clearing a run that produced nothing.
  useEffect(() => {
    if (agentStatus === "failed") {
      setGeneratingSlot(null);
      return;
    }
    if (agentStatus === "done") {
      const t = setTimeout(() => setGeneratingSlot(null), 800);
      return () => clearTimeout(t);
    }
  }, [agentStatus]);

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

  // Handle context menu actions
  const handleRun = async () => {
    if (!projectId) return;
    // Mirror the legacy handler's image/video detection (see
    // src/lib/handlers/generation-handler.ts): a modelId that resolves to a
    // known video model means this run targets video generation.
    const kind: "image" | "video" =
      generationSettings.modelId &&
      getVideoModelById(generationSettings.modelId)
        ? "video"
        : "image";

    // Reserve a correctly-sized, non-overlapping spot up front so the loading
    // placeholder appears instantly on click and the server can place the asset
    // in the exact same place (sent as `placement`).
    const { width, height } = dimsForOutput(generationSettings.imageSize, kind);
    const occupied: Rect[] = [...images, ...videos].map((el) => ({
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
    }));
    const { x, y } = findOpenSpot(occupied, width, height);
    setGeneratingSlot({ x, y, width, height, kind });

    await startAgentRun({
      projectId,
      brief: generationSettings.prompt ?? "",
      kind,
      aspectRatio: generationSettings.imageSize,
      referencedAssetIds: generationSettings.referencedAssetIds,
      placement: { x, y, width, height },
    });
  };

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

  // Function to handle the "Remove Background from Video" option in the context menu
  const handleRemoveVideoBackground = (videoId: string) => {
    const video = videos.find((vid) => vid.id === videoId);
    if (!video) return;

    setSelectedVideoForBackgroundRemoval(videoId);
    setIsRemoveVideoBackgroundDialogOpen(true);
  };

  // Function to handle the video background removal
  const handleVideoBackgroundRemoval = async (backgroundColor: string) => {
    if (!selectedVideoForBackgroundRemoval) return;

    const video = videos.find(
      (vid) => vid.id === selectedVideoForBackgroundRemoval,
    );
    if (!video) return;

    try {
      setIsRemovingVideoBackground(true);

      // Close the dialog
      setIsRemoveVideoBackgroundDialogOpen(false);

      // Don't show a toast here - the StreamingVideo component will handle progress

      // Upload video if it's a data URL or blob URL
      let videoUrl = video.src;
      if (videoUrl.startsWith("data:") || videoUrl.startsWith("blob:")) {
        const uploadResult = await falClient.storage.upload(
          await (await fetch(videoUrl)).blob(),
        );
        videoUrl = uploadResult;
      }

      // Create a unique ID for this generation
      const generationId = `bg_removal_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Map the background color to the API's expected format
      const colorMap: Record<string, string> = {
        transparent: "Transparent",
        black: "Black",
        white: "White",
        gray: "Gray",
        red: "Red",
        green: "Green",
        blue: "Blue",
        yellow: "Yellow",
        cyan: "Cyan",
        magenta: "Magenta",
        orange: "Orange",
      };

      // Map to API format
      const apiBackgroundColor = colorMap[backgroundColor] || "Black";

      // Add to active generations
      setActiveVideoGenerations((prev) => {
        const newMap = new Map(prev);
        newMap.set(generationId, {
          imageUrl: videoUrl,
          prompt: `Removing background from video`,
          duration: video.duration || 5,
          modelId: "bria-video-background-removal",
          modelConfig: getVideoModelById("bria-video-background-removal"),
          sourceVideoId: video.id,
          backgroundColor: apiBackgroundColor,
          userId: user?.id || undefined,
          sessionId: sessionId || undefined,
        });
        return newMap;
      });

      // Create a persistent toast that will stay visible until the conversion completes
      const toastId = toast.add({
        title: "Removing background from video",
        description: "This may take several minutes...",
      });

      // Store the toast ID with the generation for later reference
      setActiveVideoGenerations((prev) => {
        const newMap = new Map(prev);
        const generation = newMap.get(generationId);
        if (generation) {
          newMap.set(generationId, {
            ...generation,
            toastId,
          });
        }
        return newMap;
      });

      // Remove the direct API call since StreamingVideo will handle it
      // The StreamingVideo component will handle the actual API call and progress updates
    } catch (error) {
      console.error("Error removing video background:", error);
      toast.add({
        title: "Error processing video",
        description:
          error instanceof Error ? error.message : "An error occurred",
        type: "error",
      });

      // Remove from active generations
      setActiveVideoGenerations((prev) => {
        const newMap = new Map(prev);
        const generationId = Array.from(prev.keys()).find(
          (key) =>
            prev.get(key)?.sourceVideoId === selectedVideoForBackgroundRemoval,
        );
        if (generationId) {
          newMap.delete(generationId);
        }
        return newMap;
      });
    } finally {
      // Don't set isRemovingVideoBackground to false here - let the completion/error handlers do it
      setSelectedVideoForBackgroundRemoval(null);
    }
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
