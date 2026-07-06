import React from "react";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useTRPC } from "@/trpc/client";
import type { ActiveGeneration } from "@/types/canvas";

interface StreamingImageProps {
  imageId: string;
  generation: ActiveGeneration;
  onComplete: (imageId: string, finalUrl: string) => void;
  onError: (imageId: string, error: string) => void;
  onStreamingUpdate: (imageId: string, url: string) => void;
  onStateChange: (
    imageId: string,
    state: "submitting" | "running" | "success",
  ) => void;
  apiKey?: string;
  userId?: string;
}

export const StreamingImage: React.FC<StreamingImageProps> = ({
  imageId,
  generation,
  onComplete,
  onError,
  onStreamingUpdate,
  onStateChange,
  apiKey,
  userId,
}) => {
  const [hasStartedStreaming, setHasStartedStreaming] = React.useState(false);

  useSubscription(
    useTRPC().generateImageStream.subscriptionOptions(
      {
        ...(generation.imageUrl ? { imageUrl: generation.imageUrl } : {}),
        ...(generation.imageSrcs && generation.imageSrcs.length > 0
          ? { imageSrcs: generation.imageSrcs }
          : {}),
        prompt: generation.prompt,
        ...(generation.loraUrl ? { loraUrl: generation.loraUrl } : {}),
        ...(generation.imageSize ? { imageSize: generation.imageSize } : {}),
        ...(apiKey ? { apiKey } : {}),
        ...(userId ? { userId } : {}),
      },
      {
        enabled: true,
        onData: (data: any) => {
          const eventData = data.data;

          if (eventData.type === "progress") {
            // Change to "running" state on first progress update
            if (!hasStartedStreaming) {
              onStateChange(imageId, "running");
              setHasStartedStreaming(true);
            }

            const event = eventData.data;
            if (event.images && event.images.length > 0) {
              onStreamingUpdate(imageId, event.images[0].url);
            }
          } else if (eventData.type === "complete") {
            // Change to "success" state briefly before completing
            onStateChange(imageId, "success");

            // Show success state for 500ms before completing
            setTimeout(() => {
              onComplete(imageId, eventData.imageUrl);
            }, 500);
          } else if (eventData.type === "error") {
            onError(imageId, eventData.error);
          }
        },
        onError: (error) => {
          console.error("Subscription error:", error);
          onError(imageId, error.message || "Generation failed");
        },
      },
    ),
  );

  return null;
};
