import type {
  BoundingBox,
  PlacedImage,
  PlacedVideo,
  GenerationSettings,
} from "@/types/canvas";
import { type FalClient } from "@fal-ai/client";

/**
 * Check if two bounding boxes overlap
 */
export const boxesOverlap = (
  a: BoundingBox,
  b: BoundingBox,
  padding = 10,
): boolean => {
  return !(
    a.x + a.width + padding <= b.x ||
    b.x + b.width + padding <= a.x ||
    a.y + a.height + padding <= b.y ||
    b.y + b.height + padding <= a.y
  );
};

/**
 * Find a non-overlapping position for a new asset
 * Starts at the preferred position and searches for a free spot
 */
export const findNonOverlappingPosition = (
  preferredX: number,
  preferredY: number,
  width: number,
  height: number,
  existingAssets: BoundingBox[],
  maxAttempts = 50,
): { x: number; y: number } => {
  const newBox: BoundingBox = { x: preferredX, y: preferredY, width, height };

  // Check if preferred position is free
  const hasOverlap = existingAssets.some((asset) =>
    boxesOverlap(newBox, asset),
  );
  if (!hasOverlap) {
    return { x: preferredX, y: preferredY };
  }

  // Try positions in a spiral pattern: right, down, left, up
  const gap = 20;
  let attempt = 0;
  let offsetX = 0;
  let offsetY = 0;
  let direction = 0; // 0=right, 1=down, 2=left, 3=up
  let stepsInDirection = 1;
  let stepsTaken = 0;
  let directionChanges = 0;

  while (attempt < maxAttempts) {
    // Move in current direction
    switch (direction) {
      case 0:
        offsetX += width + gap;
        break; // right
      case 1:
        offsetY += height + gap;
        break; // down
      case 2:
        offsetX -= width + gap;
        break; // left
      case 3:
        offsetY -= height + gap;
        break; // up
    }
    stepsTaken++;
    attempt++;

    const testBox: BoundingBox = {
      x: preferredX + offsetX,
      y: preferredY + offsetY,
      width,
      height,
    };

    const overlaps = existingAssets.some((asset) =>
      boxesOverlap(testBox, asset),
    );
    if (!overlaps) {
      return { x: testBox.x, y: testBox.y };
    }

    // Change direction after completing steps
    if (stepsTaken >= stepsInDirection) {
      stepsTaken = 0;
      direction = (direction + 1) % 4;
      directionChanges++;
      // Increase steps every 2 direction changes (completing a half-spiral)
      if (directionChanges % 2 === 0) {
        stepsInDirection++;
      }
    }
  }

  // Fallback: just offset down if no free spot found
  return { x: preferredX + width + gap, y: preferredY + height + gap };
};

export const uploadImageDirect = async (
  dataUrl: string,
  falClient: FalClient,
  toast: (props: {
    title: string;
    description?: string;
    variant?: "default" | "destructive";
  }) => void,
) => {
  // Convert data URL to blob first
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  try {
    // Check size before attempting upload
    if (blob.size > 10 * 1024 * 1024) {
      // 10MB warning
      console.warn(
        "Large image detected:",
        (blob.size / 1024 / 1024).toFixed(2) + "MB",
      );
    }

    // Upload directly to FAL through proxy (using the client instance)
    const uploadResult = await falClient.storage.upload(blob);

    return { url: uploadResult };
  } catch (error: any) {
    // Check for rate limit error
    const isRateLimit =
      error.status === 429 ||
      error.message?.includes("429") ||
      error.message?.includes("rate limit") ||
      error.message?.includes("Rate limit");

    if (isRateLimit) {
      toast({
        title: "Rate limit exceeded",
        description:
          "Add your FAL API key to bypass rate limits. Without an API key, uploads are limited.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Failed to upload image",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    }

    // Re-throw the error so calling code knows upload failed
    throw error;
  }
};

/**
 * Process an image for generation: Crop -> Canvas -> Blob -> Upload
 */
export const processAndUploadImage = async (
  img: PlacedImage,
  falClient: FalClient,
  toast: (props: {
    title: string;
    description?: string;
    variant?: "default" | "destructive";
  }) => void,
): Promise<{ url: string; width: number; height: number } | null> => {
  try {
    // Get crop values
    const cropX = img.cropX || 0;
    const cropY = img.cropY || 0;
    const cropWidth = img.cropWidth || 1;
    const cropHeight = img.cropHeight || 1;

    // Load the image - use proxy for S3 URLs to bypass CORS
    const imgElement = new window.Image();
    imgElement.crossOrigin = "anonymous"; // Enable CORS

    // Check if the image is from S3 (InstantDB storage) and needs proxying
    const needsProxy =
      img.src.includes("instant-storage.s3.amazonaws.com") ||
      img.src.includes("storage.googleapis.com");

    imgElement.src = needsProxy
      ? `/api/proxy-image?url=${encodeURIComponent(img.src)}`
      : img.src;
    await new Promise((resolve, reject) => {
      imgElement.onload = resolve;
      imgElement.onerror = reject;
    });

    // Create a canvas for the image at original resolution
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");

    // Calculate the effective original dimensions accounting for crops
    let effectiveWidth = imgElement.naturalWidth;
    let effectiveHeight = imgElement.naturalHeight;

    if (cropWidth !== 1 || cropHeight !== 1) {
      effectiveWidth = cropWidth * imgElement.naturalWidth;
      effectiveHeight = cropHeight * imgElement.naturalHeight;
    }

    // Set canvas size to the original resolution (not display size)
    canvas.width = effectiveWidth;
    canvas.height = effectiveHeight;

    console.log(
      `Processing image at ${canvas.width}x${canvas.height} (original res, display: ${img.width}x${img.height})`,
    );

    // Always use the crop values (default to full image if not set)
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

    const uploadResult = await uploadImageDirect(dataUrl, falClient, toast);

    if (!uploadResult?.url) {
      return null;
    }

    return {
      url: uploadResult.url,
      width: canvas.width,
      height: canvas.height,
    };
  } catch (error) {
    console.error("Error processing image:", error);
    toast({
      title: "Failed to process image",
      description:
        error instanceof Error ? error.message : "Failed to process image",
      variant: "destructive",
    });
    return null;
  }
};
