import React from "react";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useTRPC } from "@/trpc/client";
import type { ActiveVideoGeneration } from "@/types/canvas";

interface StreamingVideoProps {
  videoId: string;
  generation: ActiveVideoGeneration;
  onComplete: (
    videoId: string,
    videoUrl: string,
    duration: number,
    referencedAssetIds?: string[],
  ) => void;
  onError: (videoId: string, error: string) => void;
  onProgress: (videoId: string, progress: number, status: string) => void;
  apiKey?: string;
}

const getAspectRatio = (size?: string): string => {
  if (!size) return "16:9";
  if (size.includes("16_9")) return size.includes("portrait") ? "9:16" : "16:9";
  if (size.includes("4_3")) return size.includes("portrait") ? "3:4" : "4:3";
  if (size.includes("square")) return "1:1";
  return "16:9";
};

export const StreamingVideo: React.FC<StreamingVideoProps> = ({
  videoId,
  generation,
  onComplete,
  onError,
  onProgress,
  apiKey,
}) => {
  // Determine which endpoint to use based on the generation type
  let subscriptionOptions;

  // Check if this is a video-to-video transformation
  const isVideoToVideo = generation.isVideoToVideo || generation.videoUrl;
  const isVideoExtension = generation.isVideoExtension;

  if (generation.imageUrl || generation.videoUrl) {
    // Both image-to-video and video-to-video use the same endpoint with multiconditioning
    subscriptionOptions = useTRPC().generateImageToVideo.subscriptionOptions(
      {
        imageUrl: generation.imageUrl || generation.videoUrl || "", // Prioritize image URL, fallback to video URL
        prompt: generation.prompt,
        duration: generation.duration || 5,
        modelId: generation.modelId || "seedance-pro", // Always use multiconditioning model
        resolution: generation.resolution || "720p",
        cameraFixed: generation.cameraFixed,
        seed: generation.seed,
        isVideoToVideo: isVideoToVideo,
        isVideoExtension: isVideoExtension,
        referencedAssetIds: generation.referencedAssetIds, // Pass to endpoint (though endpoint might ignore it, we need it back or just use from generation prop)
        // Include all model-specific fields
        ...Object.fromEntries(
          Object.entries(generation).filter(
            ([key]) =>
              ![
                "imageUrl",
                // "videoUrl", // We need to pass videoUrl for Motion Control
                "sourceImageId",
                "sourceVideoId",
                "toastId",
                "referencedAssetIds", // Exclude from generic model params as we handle it
              ].includes(key),
          ),
        ),
        ...(apiKey ? { apiKey } : {}),
        userId: generation.userId,
        sessionId: generation.sessionId,
      },
      {
        enabled: true,
        onData: async (data: any) => {
          const eventData = data.data;

          if (eventData.type === "progress") {
            onProgress(
              videoId,
              eventData.progress || 0,
              eventData.status ||
                (isVideoExtension
                  ? "Extending video..."
                  : isVideoToVideo
                    ? "Transforming video..."
                    : "Converting image to video..."),
            );
          } else if (eventData.type === "complete") {
            onComplete(
              videoId,
              eventData.videoUrl,
              eventData.duration || generation.duration || 5,
              generation.referencedAssetIds, // Pass lineage back
            );
          } else if (eventData.type === "error") {
            onError(videoId, eventData.error);
          }
        },
        onError: (error) => {
          console.error(
            isVideoExtension
              ? "Video extension error:"
              : isVideoToVideo
                ? "Video-to-video transformation error:"
                : "Image-to-video conversion error:",
            error,
          );
          onError(
            videoId,
            error.message ||
              (isVideoExtension
                ? "Video extension failed"
                : isVideoToVideo
                  ? "Video-to-video transformation failed"
                  : "Image-to-video conversion failed"),
          );
        },
      },
    );
  } else {
    // Text-to-video generation
    subscriptionOptions = useTRPC().generateTextToVideo.subscriptionOptions(
      {
        prompt: generation.prompt,
        duration: generation.duration || 3,
        styleId: generation.styleId,
        ...(apiKey ? { apiKey } : {}),
        userId: generation.userId,
        sessionId: generation.sessionId,
        aspectRatio: getAspectRatio(generation.imageSize),
      },
      {
        enabled: true,
        onData: async (data: any) => {
          const eventData = data.data;

          if (eventData.type === "progress") {
            onProgress(
              videoId,
              eventData.progress || 0,
              eventData.status || "Generating video from text...",
            );
          } else if (eventData.type === "complete") {
            onComplete(
              videoId,
              eventData.videoUrl,
              eventData.duration || generation.duration || 3,
            );
          } else if (eventData.type === "error") {
            onError(videoId, eventData.error);
          }
        },
        onError: (error) => {
          console.error("Text-to-video generation error:", error);
          onError(videoId, error.message || "Text-to-video generation failed");
        },
      },
    );
  }

  // Create the subscription
  useSubscription(subscriptionOptions);

  return null;
};
