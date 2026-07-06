"use client";

import React from "react";
import { useState, useCallback } from "react";
import { Stage, Layer } from "react-konva";
import Konva from "konva";
import { canvasStorage, type CanvasState } from "@/lib/instant-storage";
import { useAuth } from "@/providers/auth-provider";
import { id } from "@instantdb/react";

import { Button } from "@/components/ui/button";
import { Plus, Undo, Redo, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery } from "@tanstack/react-query";
import NumberFlow from "@number-flow/react";
import { DiamondsFourIcon } from "@phosphor-icons/react";
import { useRef, useEffect } from "react";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { styleActions, getDefaultStyle } from "@/lib/prompt-actions";
import { useToast } from "@/hooks/use-toast";

// Import extracted components
//import { ShortcutBadge } from "@/components/canvas/ShortcutBadge";
import { StreamingImage } from "@/components/canvas/StreamingImage";
import { StreamingVideo } from "@/components/canvas/StreamingVideo";
import { CropOverlayWrapper } from "@/components/canvas/CropOverlayWrapper";
import { CanvasImage } from "@/components/canvas/CanvasImage";
import { CanvasVideo } from "@/components/canvas/CanvasVideo";
//import { VideoControls } from "@/components/canvas/VideoControls";
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
  ActiveGeneration,
  ActiveVideoGeneration,
  SelectionBox,
} from "@/types/canvas";

import {
  imageToCanvasElement,
  videoToCanvasElement,
} from "@/utils/canvas-utils";
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
//import { MiniMap } from "@/components/canvas/MiniMap";
import { ZoomControls } from "@/components/canvas/ZoomControls";
import { MobileToolbar } from "@/components/canvas/MobileToolbar";
import { CanvasContextMenu } from "@/components/canvas/CanvasContextMenu";
import { CanvasLeftSidebar } from "@/components/canvas/CanvasLeftSidebar";
//import { CanvasRightSidebar } from "@/components/canvas/CanvasRightSidebar";
import { VideoOverlays } from "@/components/canvas/VideoOverlays";
import { DimensionDisplay } from "@/components/canvas/DimensionDisplay";
import {
  PromptEditor,
  PromptEditorHandle,
} from "@/components/canvas/PromptEditor";
import { GeneratingPlaceholder } from "@/components/canvas/GeneratingPlaceholder";
import { SettingsDialog } from "@/components/canvas/SettingsDialog";
import { AgentLogOverlay } from "@/components/canvas/AgentLogOverlay";
import Image from "next/image";
import { db } from "@/lib/db";
import { useAgentRun } from "@/hooks/useAgentRun";

// Import handlers
import { uploadImageDirect } from "@/lib/handlers/generation-handler";
import { handleRemoveBackground as handleRemoveBackgroundHandler } from "@/lib/handlers/background-handler";
import { useParams } from "next/navigation";

export default function OverlayPage() {
  const { user, sessionId } = useAuth();
  const params = useParams();
  const projectId = params?.id as string;
  const {
    start: startAgentRun,
    events: agentEvents,
    status: agentStatus,
  } = useAgentRun();
  const [images, setImages] = useState<PlacedImage[]>([]);
  const [videos, setVideos] = useState<PlacedVideo[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  // const [visibleIndicators, setVisibleIndicators] = useState<Set<string>>(
  //   new Set(),
  // );
  const defaultStyle = getDefaultStyle();
  const toast = useToast();

  const [generationSettings, setGenerationSettings] =
    useState<GenerationSettings>({
      prompt: defaultStyle.prompt,
      loraUrl: defaultStyle.loraUrl || "",
      styleId: defaultStyle.id,
    });
  const [previousStyleId, setPreviousStyleId] = useState<string>(
    defaultStyle.id,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeGenerations, setActiveGenerations] = useState<
    Map<string, ActiveGeneration>
  >(new Map());
  const [activeVideoGenerations, setActiveVideoGenerations] = useState<
    Map<string, ActiveVideoGeneration>
  >(new Map());
  const [selectionBox, setSelectionBox] = useState<SelectionBox>({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    visible: false,
  });
  const [isSelecting, setIsSelecting] = useState(false);
  const [dragStartPositions, setDragStartPositions] = useState<
    Map<string, { x: number; y: number }>
  >(new Map());
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [hiddenVideoControlsIds, setHiddenVideoControlsIds] = useState<
    Set<string>
  >(new Set());
  // Use a consistent initial value for server and client to avoid hydration errors
  const [canvasSize, setCanvasSize] = useState({
    width: 1200,
    height: 800,
  });
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [lastPanPosition, setLastPanPosition] = useState({ x: 0, y: 0 });
  const [croppingImageId, setCroppingImageId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({
    x: 0,
    y: 0,
    scale: 1,
  });
  const stageRef = useRef<Konva.Stage>(null);
  const promptEditorRef = useRef<PromptEditorHandle>(null);
  // Track sync source to avoid infinite loops in bidirectional sync
  const syncSourceRef = useRef<"canvas" | "prompt" | null>(null);
  const [isolateTarget, setIsolateTarget] = useState<string | null>(null);
  const [isolateInputValue, setIsolateInputValue] = useState("");
  const [isIsolating, setIsIsolating] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  //const [showMinimap, setShowMinimap] = useState(true);
  const [isStyleDialogOpen, setIsStyleDialogOpen] = useState(false);
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
  const [_, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Touch event states for mobile
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(
    null,
  );
  const [lastTouchCenter, setLastTouchCenter] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isTouchingImage, setIsTouchingImage] = useState(false);

  // Track when generation completes
  const [previousGenerationCount, setPreviousGenerationCount] = useState(0);

  useEffect(() => {
    const currentCount =
      activeGenerations.size +
      activeVideoGenerations.size +
      (isGenerating ? 1 : 0) +
      (isRemovingVideoBackground ? 1 : 0) +
      (isIsolating ? 1 : 0) +
      (isExtendingVideo ? 1 : 0) +
      (isTransformingVideo ? 1 : 0);

    // If we went from having generations to having none, show success
    if (previousGenerationCount > 0 && currentCount === 0) {
      setShowSuccess(true);
      // Hide success after 2 seconds
      const timeout = setTimeout(() => {
        setShowSuccess(false);
      }, 2000);
      return () => clearTimeout(timeout);
    }

    setPreviousGenerationCount(currentCount);
  }, [
    activeGenerations.size,
    activeVideoGenerations.size,
    isGenerating,
    isRemovingVideoBackground,
    isIsolating,
    isExtendingVideo,
    isTransformingVideo,
    previousGenerationCount,
  ]);

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
          },
        }
      : { canvasProjects: { $: { where: { id: "__none__" } } } },
  );
  const project = projectData?.canvasProjects?.[0];
  const projectName = (project?.name as string) || "Untitled";
  const folderName = (project?.folder?.name as string) || "Drafts";

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
      setIsGenerating(false);
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
      setIsGenerating(false);
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
    setIsGenerating(false);
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

  // Save current state to storage
  const saveToStorage = useCallback(async () => {
    try {
      setIsSaving(true);

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

      // Brief delay to show the indicator
      setTimeout(() => setIsSaving(false), 300);
    } catch (error) {
      setIsSaving(false);
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
        userId: user?.id || null,
        sessionId,
        projectId,
      });

      canvasStorage.setUser(user?.id || null, sessionId);

      if (projectId) {
        canvasStorage.setCurrentProject(projectId);
        console.log("[CANVAS] Loading from storage for project:", projectId);
        // Load from storage after project ID is set
        await loadFromStorage();
        // History is now loaded automatically via db.useQuery
      }
    };

    initializeStorage();
  }, [user?.id, sessionId, projectId, loadFromStorage]);

  // When an agent run completes, reload the canvas so the generated media (persisted
  // server-side as new canvas elements) appears without a manual refresh.
  useEffect(() => {
    if (agentStatus === "done") {
      void loadFromStorage();
    }
  }, [agentStatus, loadFromStorage]);

  // Load grid setting from localStorage on mount
  useEffect(() => {
    const savedShowGrid = localStorage.getItem("showGrid");
    if (savedShowGrid !== null) {
      setShowGrid(savedShowGrid === "true");
    }
  }, []);

  // Load minimap setting from localStorage on mount
  //useEffect(() => {
  //  const savedShowMinimap = localStorage.getItem("showMinimap");
  //  if (savedShowMinimap !== null) {
  //    setShowMinimap(savedShowMinimap === "true");
  //  }
  //}, []);

  // Save grid setting to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("showGrid", showGrid.toString());
  }, [showGrid]);

  // Save minimap setting to localStorage when it changes
  //useEffect(() => {
  //  localStorage.setItem("showMinimap", showMinimap.toString());
  //}, [showMinimap]);

  // Track previous style when changing styles (but not when reverting from custom)
  useEffect(() => {
    const currentStyleId = generationSettings.styleId;
    if (
      currentStyleId &&
      currentStyleId !== "custom" &&
      currentStyleId !== previousStyleId
    ) {
      setPreviousStyleId(currentStyleId);
    }
  }, [generationSettings.styleId, previousStyleId]);

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

  // Auto-save to storage when images or videos change (with debounce)
  useEffect(() => {
    if (!isStorageLoaded) return; // Don't save until we've loaded
    if (activeGenerations.size > 0) return;

    const timeoutId = setTimeout(() => {
      saveToStorage();
    }, 500); // Reduced to 500ms for faster saving

    return () => clearTimeout(timeoutId);
  }, [
    images,
    videos,
    viewport,
    isStorageLoaded,
    saveToStorage,
    activeGenerations.size,
  ]);

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

  // Helper function to resize image if too large
  const resizeImageIfNeeded = async (
    dataUrl: string,
    maxWidth: number = 2048,
    maxHeight: number = 2048,
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        // Check if resize is needed
        if (img.width <= maxWidth && img.height <= maxHeight) {
          resolve(dataUrl);
          return;
        }

        // Calculate new dimensions
        let newWidth = img.width;
        let newHeight = img.height;
        const aspectRatio = img.width / img.height;

        if (newWidth > maxWidth) {
          newWidth = maxWidth;
          newHeight = newWidth / aspectRatio;
        }
        if (newHeight > maxHeight) {
          newHeight = maxHeight;
          newWidth = newHeight * aspectRatio;
        }

        // Create canvas and resize
        const canvas = document.createElement("canvas");
        canvas.width = newWidth;
        canvas.height = newHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, newWidth, newHeight);

        // Convert to data URL with compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to create blob"));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          0.9, // 90% quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = dataUrl;
    });
  };

  // Helper function to create a cropped image
  const createCroppedImage = async (
    imageSrc: string,
    cropX: number,
    cropY: number,
    cropWidth: number,
    cropHeight: number,
  ): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous"; // Enable CORS
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Set canvas size to the natural cropped dimensions
        canvas.width = cropWidth * img.naturalWidth;
        canvas.height = cropHeight * img.naturalHeight;

        // Draw the cropped portion at full resolution
        ctx.drawImage(
          img,
          cropX * img.naturalWidth,
          cropY * img.naturalHeight,
          cropWidth * img.naturalWidth,
          cropHeight * img.naturalHeight,
          0,
          0,
          canvas.width,
          canvas.height,
        );

        // Convert to data URL
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Failed to create blob"));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, "image/png");
      };
      img.onerror = () => reject(new Error("Failed to load image"));

      // Use proxy for S3 URLs to bypass CORS
      const needsProxy =
        imageSrc.includes("instant-storage.s3.amazonaws.com") ||
        imageSrc.includes("storage.googleapis.com");

      img.src = needsProxy
        ? `/api/proxy-image?url=${encodeURIComponent(imageSrc)}`
        : imageSrc;
    });
  };

  // Handle file upload
  const handleFileUpload = (
    files: FileList | null,
    position?: { x: number; y: number },
  ) => {
    if (!files) return;

    Array.from(files).forEach((file, index) => {
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const imageId = id(); // Use UUID from InstantDB
          const img = new window.Image();
          img.crossOrigin = "anonymous"; // Enable CORS
          img.onload = () => {
            const width = img.naturalWidth;
            const height = img.naturalHeight;

            // Place image at position or center of current viewport
            let x, y;
            if (position) {
              // Convert screen position to canvas coordinates
              x = (position.x - viewport.x) / viewport.scale - width / 2;
              y = (position.y - viewport.y) / viewport.scale - height / 2;
            } else {
              // Center of viewport
              const viewportCenterX =
                (canvasSize.width / 2 - viewport.x) / viewport.scale;
              const viewportCenterY =
                (canvasSize.height / 2 - viewport.y) / viewport.scale;
              x = viewportCenterX - width / 2;
              y = viewportCenterY - height / 2;
            }

            // Add offset for multiple files
            if (index > 0) {
              x += index * 20;
              y += index * 20;
            }

            setImages((prev) => [
              ...prev,
              {
                id: imageId,
                src: e.target?.result as string,
                x,
                y,
                width,
                height,
                rotation: 0,
              },
            ]);
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      }
    });
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
      const selectedIds = [
        ...selectedImages.map((img) => img.id),
        ...selectedVideos.map((vid) => vid.id),
      ];

      if (selectedIds.length > 0) {
        setSelectedIds(selectedIds);
      }
    }

    setIsSelecting(false);
    setSelectionBox({ ...selectionBox, visible: false });
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
    await startAgentRun({
      projectId,
      brief: generationSettings.prompt ?? "",
      kind,
      aspectRatio: generationSettings.imageSize,
      referencedAssetIds: generationSettings.referencedAssetIds,
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

  const handleIsolate = async () => {
    if (!isolateTarget || !isolateInputValue.trim() || isIsolating) {
      return;
    }

    setIsIsolating(true);

    try {
      const image = images.find((img) => img.id === isolateTarget);
      if (!image) {
        setIsIsolating(false);
        return;
      }

      // Show loading state
      toast.add({
        title: "Processing...",
        description: `Isolating "${isolateInputValue}" from image`,
      });

      // Process the image to get the cropped/processed version
      const imgElement = new window.Image();
      imgElement.crossOrigin = "anonymous"; // Enable CORS

      // Use proxy for S3 URLs to bypass CORS
      const needsProxy =
        image.src.includes("instant-storage.s3.amazonaws.com") ||
        image.src.includes("storage.googleapis.com");

      imgElement.src = needsProxy
        ? `/api/proxy-image?url=${encodeURIComponent(image.src)}`
        : image.src;

      await new Promise((resolve) => {
        imgElement.onload = resolve;
      });

      // Create canvas for processing
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");

      // Get crop values
      const cropX = image.cropX || 0;
      const cropY = image.cropY || 0;
      const cropWidth = image.cropWidth || 1;
      const cropHeight = image.cropHeight || 1;

      // Set canvas size based on crop
      canvas.width = cropWidth * imgElement.naturalWidth;
      canvas.height = cropHeight * imgElement.naturalHeight;

      // Draw cropped image
      ctx.drawImage(
        imgElement,
        cropX * imgElement.naturalWidth,
        cropY * imgElement.naturalHeight,
        cropWidth * imgElement.naturalWidth,
        cropHeight * imgElement.naturalHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      // Convert to blob and upload
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), "image/png");
      });

      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(blob);
      });

      // Upload the processed image
      const uploadResult = await uploadImageDirect(
        dataUrl,
        falClient,
        toast.add,
      );

      // Isolate object using EVF-SAM2
      console.log("Calling isolateObject with:", {
        imageUrl: uploadResult?.url || "",
        textInput: isolateInputValue,
      });

      const result = await isolateObject({
        imageUrl: uploadResult?.url || "",
        textInput: isolateInputValue,
      });

      console.log("IsolateObject result:", result);

      // Use the segmented image URL directly (backend already applied the mask)
      if (result.url) {
        console.log("Original image URL:", image.src);
        console.log("New isolated image URL:", result.url);
        console.log("Result object:", JSON.stringify(result, null, 2));

        // AUTO DOWNLOAD FOR DEBUGGING
        try {
          const link = document.createElement("a");
          link.href = result.url;
          link.download = `isolated-${isolateInputValue}-${Date.now()}.png`;
          link.target = "_blank"; // Open in new tab to see the image
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          console.log("Auto-downloaded isolated image for debugging");
        } catch (e) {
          console.error("Failed to auto-download:", e);
        }

        // Force load the new image before updating state
        const testImg = new window.Image();
        testImg.crossOrigin = "anonymous";
        testImg.onload = () => {
          console.log(
            "New image loaded successfully:",
            testImg.width,
            "x",
            testImg.height,
          );

          // Create a test canvas to verify the image has transparency
          const testCanvas = document.createElement("canvas");
          testCanvas.width = testImg.width;
          testCanvas.height = testImg.height;
          const testCtx = testCanvas.getContext("2d");
          if (testCtx) {
            // Fill with red background
            testCtx.fillStyle = "red";
            testCtx.fillRect(0, 0, testCanvas.width, testCanvas.height);
            // Draw the image on top
            testCtx.drawImage(testImg, 0, 0);

            // Get a pixel from what should be transparent area (corner)
            const pixelData = testCtx.getImageData(0, 0, 1, 1).data;
            console.log("Corner pixel (should show red if transparent):", {
              r: pixelData[0],
              g: pixelData[1],
              b: pixelData[2],
              a: pixelData[3],
            });
          }

          // Update the image in place with the segmented image
          saveToHistory();

          // Create a completely new image URL with timestamp
          const newImageUrl = `${result.url}${result.url.includes("?") ? "&" : "?"}t=${Date.now()}&cache=no`;

          // Get the current image to preserve position
          const currentImage = images.find((img) => img.id === isolateTarget);
          if (!currentImage) {
            console.error("Could not find current image!");
            return;
          }

          // Create new image with UUID
          const newImage: PlacedImage = {
            ...currentImage,
            id: id(), // Use UUID from InstantDB
            src: newImageUrl,
            // Remove crop values since we've applied them
            cropX: undefined,
            cropY: undefined,
            cropWidth: undefined,
            cropHeight: undefined,
          };

          setImages((prev) => {
            // Replace old image with new one at same index
            const newImages = [...prev];
            const index = newImages.findIndex(
              (img) => img.id === isolateTarget,
            );
            if (index !== -1) {
              newImages[index] = newImage;
            }
            return newImages;
          });

          // Update selection
          setSelectedIds([newImage.id]);

          toast.add({
            title: "Success",
            description: `Isolated "${isolateInputValue}" successfully`,
          });
        };

        testImg.onerror = (e) => {
          console.error("Failed to load new image:", e);
          toast.add({
            title: "Failed to load isolated image",
            description: "The isolated image could not be loaded",
            type: "error",
          });
        };

        testImg.src = result.url;
      } else {
        toast.add({
          title: "No object found",
          description: `Could not find "${isolateInputValue}" in the image`,
          type: "error",
        });
      }

      // Reset the isolate input
      setIsolateTarget(null);
      setIsolateInputValue("");
      setIsIsolating(false);
    } catch (error) {
      console.error("Error isolating object:", error);
      toast.add({
        title: "Failed to isolate object",
        description: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
      setIsolateTarget(null);
      setIsolateInputValue("");
      setIsIsolating(false);
    }
  };

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
        if (!isGenerating && generationSettings.prompt.trim()) {
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
        {/* Render streaming components for active generations */}
        {Array.from(activeGenerations.entries()).map(
          ([imageId, generation]) => (
            <StreamingImage
              key={imageId}
              imageId={imageId}
              generation={generation}
              onStreamingUpdate={(id, url) => {
                setImages((prev) =>
                  prev.map((img) =>
                    img.id === id ? { ...img, src: url } : img,
                  ),
                );
              }}
              onStateChange={(id, state) => {
                setActiveGenerations((prev) => {
                  const newMap = new Map(prev);
                  const gen = newMap.get(id);
                  if (gen) {
                    newMap.set(id, { ...gen, state });
                  }
                  return newMap;
                });
              }}
              onComplete={(id, finalUrl) => {
                // Refetch credits after generation completes
                refetchCredits();

                // Get the generation data to attach metadata
                const generation = activeGenerations.get(id);
                setImages((prev) =>
                  prev.map((img) =>
                    img.id === id
                      ? {
                          ...img,
                          src: finalUrl,
                          generationPrompt: generation?.prompt,
                          // Credits info not available from API yet
                          creditsConsumed: undefined,
                          referencedAssetIds: generation?.referencedAssetIds,
                        }
                      : img,
                  ),
                );

                // Set success state first
                setActiveGenerations((prev) => {
                  const newMap = new Map(prev);
                  const gen = newMap.get(id);
                  if (gen) {
                    newMap.set(id, { ...gen, state: "success" });
                  }
                  return newMap;
                });

                // Show success state for 1.5 seconds, then clean up
                setTimeout(() => {
                  setActiveGenerations((prev) => {
                    const newMap = new Map(prev);
                    newMap.delete(id);
                    return newMap;
                  });
                  setIsGenerating(false);

                  // Save to history for undo/redo
                  saveToHistory();

                  // Immediately save after generation completes
                  setTimeout(() => {
                    saveToStorage();
                  }, 100); // Small delay to ensure state updates are processed
                }, 1500);
              }}
              onError={(id, error) => {
                console.error(`Generation error for ${id}:`, error);
                // Remove the failed image
                setImages((prev) => prev.filter((img) => img.id !== id));
                setActiveGenerations((prev) => {
                  const newMap = new Map(prev);
                  newMap.delete(id);
                  return newMap;
                });
                setIsGenerating(false);
                toast.add({
                  title: "Generation failed",
                  description: error.toString(),
                  type: "error",
                });
              }}
            />
          ),
        )}

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
                      onMouseLeave={() => {
                        // Stop panning if mouse leaves the stage
                        if (isPanningCanvas) {
                          setIsPanningCanvas(false);
                        }
                      }}
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

                        {/* Render generating placeholders for images */}
                        {images
                          .filter((image) => activeGenerations.has(image.id))
                          .map((image) => {
                            const generation = activeGenerations.get(image.id);
                            return (
                              <GeneratingPlaceholder
                                key={`placeholder-${image.id}`}
                                image={image}
                                outputType="image"
                                state={generation?.state || "running"}
                              />
                            );
                          })}
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

                        {/* Render images */}
                        {images
                          .filter((image) => {
                            // Don't render images that are currently generating
                            // (they'll be shown as placeholders instead)
                            if (activeGenerations.has(image.id)) {
                              return false;
                            }

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
                isGenerating={isGenerating}
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
                isGenerating={isGenerating}
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
              isGenerating={isGenerating}
              generationState={
                Array.from(activeGenerations.values()).some(
                  (g) => g.state === "success",
                )
                  ? "success"
                  : Array.from(activeGenerations.values()).some(
                        (g) => g.state === "running",
                      )
                    ? "running"
                    : isGenerating
                      ? "submitting" // Default to submitting when generation just started
                      : "running"
              }
              handleRun={handleRun}
              handleFileUpload={handleFileUpload}
              toast={toast}
              onAssetReferencesChange={(assetIds) => {
                // Only sync if the change came from the prompt editor, not from canvas
                if (syncSourceRef.current === "canvas") return;

                syncSourceRef.current = "prompt";
                // Sync canvas selection when @ asset references change in prompt
                setSelectedIds(assetIds);
                // Reset sync source after a tick
                setTimeout(() => {
                  syncSourceRef.current = null;
                }, 0);
              }}
            />

            {/* Mini-map -- Disabled for now
          {showMinimap && (
            <MiniMap
              images={images}
              videos={videos}
              viewport={viewport}
              canvasSize={canvasSize}
            />
          )}
          */}

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

            {/* Agent run log overlay */}
            <AgentLogOverlay
              events={agentEvents}
              visible={agentStatus !== "idle"}
            />
          </div>
        </main>

        {/* Style Selection Dialog */}
        <Dialog open={isStyleDialogOpen} onOpenChange={setIsStyleDialogOpen}>
          <DialogContent className="w-[95vw] max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Choose a Style</DialogTitle>
              <DialogDescription>
                Select a style to apply to your images or choose Custom to use
                your own LoRA
              </DialogDescription>
            </DialogHeader>

            <div className="relative">
              {/* Fixed gradient overlays outside scrollable area */}
              <div className="pointer-events-none absolute -top-px left-0 right-0 z-30 h-2 md:h-12 bg-linear-to-b from-background via-background/90 to-transparent" />
              <div className="pointer-events-none absolute -bottom-px left-0 right-0 z-30 h-2 md:h-12 bg-linear-to-t from-background via-background/90 to-transparent" />

              {/* Scrollable content container */}
              <div className="overflow-y-auto max-h-[60vh] px-1">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-4 pb-6 md:pt-8 md:pb-12">
                  {/* Custom option */}
                  <button
                    onClick={() => {
                      setGenerationSettings({
                        ...generationSettings,
                        loraUrl: "",
                        prompt: "",
                        styleId: "custom",
                      });
                      setIsStyleDialogOpen(false);
                    }}
                    className={cn(
                      "group relative flex flex-col items-center gap-2 p-3 rounded-xl border",
                      generationSettings.styleId === "custom"
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <div className="w-full aspect-square rounded-lg bg-muted flex items-center justify-center">
                      <Plus className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <span className="text-sm font-medium">Custom</span>
                  </button>

                  {/* Predefined styles */}
                  {styleActions.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => {
                        setGenerationSettings({
                          ...generationSettings,
                          loraUrl: action.loraUrl || "",
                          prompt: action.prompt,
                          styleId: action.id,
                        });
                        setIsStyleDialogOpen(false);
                      }}
                      className={cn(
                        "group relative flex flex-col items-center gap-2 p-3 rounded-xl border",
                        generationSettings.styleId === action.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50",
                      )}
                    >
                      <div className="relative w-full aspect-square rounded-lg overflow-hidden">
                        {action.previewImage && (
                          <Image
                            src={action.previewImage}
                            alt={action.name}
                            width={200}
                            height={200}
                            className="w-full h-full object-cover"
                          />
                        )}
                        {generationSettings.styleId === action.id && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center"></div>
                        )}
                      </div>
                      <span className="text-sm font-medium text-center">
                        {action.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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

      {/* Right Sidebar - Hidden on mobile 
      <div className="hidden lg:block">
        <CanvasRightSidebar
          selectedIds={selectedIds}
          images={images}
          videos={videos}
          isGenerating={isGenerating}
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
      </div>
    */}
    </div>
  );
}
