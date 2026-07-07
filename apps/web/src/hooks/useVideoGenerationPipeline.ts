import React, { useState } from "react";
import { id } from "@instantdb/react";
import { convertImageToVideo } from "@/utils/video-utils";
import { getVideoModelById } from "@/lib/models-config";
import type {
  PlacedImage,
  PlacedVideo,
  VideoGenerationSettings,
  ActiveVideoGeneration,
} from "@/types/canvas";
import type { Viewport } from "@/utils/canvas-utils";
import type { useToast } from "@/hooks/use-toast";
import type { useFalClient } from "@/hooks/useFalClient";

// Owns the four dialog-driven video flows (image→video, video→video, extend,
// background removal) plus the StreamingVideo completion/error/progress
// callbacks. The dialog state and handler names match the page's former locals
// so the JSX consuming them is unchanged.
export function useVideoGenerationPipeline(opts: {
  images: PlacedImage[];
  videos: PlacedVideo[];
  setVideos: React.Dispatch<React.SetStateAction<PlacedVideo[]>>;
  saveToHistory: () => void;
  toast: ReturnType<typeof useToast>;
  falClient: ReturnType<typeof useFalClient>;
  userId: string | undefined;
  sessionId: string | undefined;
  refetchCredits: () => void;
  viewport: Viewport;
  canvasSize: { width: number; height: number };
}) {
  const {
    images,
    videos,
    setVideos,
    saveToHistory,
    toast,
    falClient,
    userId,
    sessionId,
    refetchCredits,
    viewport,
    canvasSize,
  } = opts;

  const [activeVideoGenerations, setActiveVideoGenerations] = useState<
    Map<string, ActiveVideoGeneration>
  >(new Map());
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
            userId,
            sessionId,
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
          userId: userId || undefined,
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

  return {
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
  };
}
