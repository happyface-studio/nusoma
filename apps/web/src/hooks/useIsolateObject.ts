import React, { useState } from "react";
import { id } from "@instantdb/react";
import type { PlacedImage } from "@/types/canvas";
import type { useFalClient } from "@/hooks/useFalClient";
import type { useToast } from "@/hooks/use-toast";
import { uploadImageDirect } from "@/lib/handlers/generation-helpers";

// Object isolation flow: crop the source image, upload it, run EVF-SAM2
// segmentation via the isolateObject mutation, and swap the segmented result
// in as a new element. Owns the small amount of isolate-only UI state.
export function useIsolateObject(opts: {
  images: PlacedImage[];
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  saveToHistory: () => void;
  falClient: ReturnType<typeof useFalClient>;
  isolateObject: (input: {
    imageUrl: string;
    textInput: string;
  }) => Promise<{ url: string }>;
  toast: ReturnType<typeof useToast>;
}): {
  isolateTarget: string | null;
  setIsolateTarget: React.Dispatch<React.SetStateAction<string | null>>;
  isolateInputValue: string;
  setIsolateInputValue: React.Dispatch<React.SetStateAction<string>>;
  isIsolating: boolean;
  handleIsolate: () => Promise<void>;
} {
  const {
    images,
    setImages,
    setSelectedIds,
    saveToHistory,
    falClient,
    isolateObject,
    toast,
  } = opts;

  const [isolateTarget, setIsolateTarget] = useState<string | null>(null);
  const [isolateInputValue, setIsolateInputValue] = useState("");
  const [isIsolating, setIsIsolating] = useState(false);

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
        // Force load the new image before updating state
        const testImg = new window.Image();
        testImg.crossOrigin = "anonymous";
        testImg.onload = () => {
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

  return {
    isolateTarget,
    setIsolateTarget,
    isolateInputValue,
    setIsolateInputValue,
    isIsolating,
    handleIsolate,
  };
}
