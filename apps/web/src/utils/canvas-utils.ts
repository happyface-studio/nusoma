import { id } from "@instantdb/react";
import type { PlacedImage, PlacedVideo } from "@/types/canvas";
import type { CanvasElement } from "@/lib/instant-storage";

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

// Helper to convert PlacedImage to storage format
export const imageToCanvasElement = (image: PlacedImage): CanvasElement => ({
  id: image.id,
  type: "image",
  imageId: image.id, // We'll use the same ID for both
  transform: {
    x: image.x,
    y: image.y,
    scale: 1, // We store width/height separately, so scale is 1
    rotation: image.rotation,
    ...(image.cropX !== undefined && {
      cropBox: {
        x: image.cropX,
        y: image.cropY || 0,
        width: image.cropWidth || 1,
        height: image.cropHeight || 1,
      },
    }),
  },
  zIndex: 0, // We'll use array order instead
  width: image.width,
  height: image.height,
});

// Helper to convert PlacedVideo to storage format
export const videoToCanvasElement = (video: PlacedVideo): CanvasElement => ({
  id: video.id,
  type: "video",
  videoId: video.id, // We'll use the same ID for both
  transform: {
    x: video.x,
    y: video.y,
    scale: 1, // We store width/height separately, so scale is 1
    rotation: video.rotation,
    ...(video.cropX !== undefined && {
      cropBox: {
        x: video.cropX,
        y: video.cropY || 0,
        width: video.cropWidth || 1,
        height: video.cropHeight || 1,
      },
    }),
  },
  zIndex: 0, // We'll use array order instead
  width: video.width,
  height: video.height,
  duration: video.duration,
  currentTime: video.currentTime,
  isPlaying: video.isPlaying,
  volume: video.volume,
  muted: video.muted,
});

// Convert canvas coordinates to screen coordinates
export const canvasToScreen = (
  canvasX: number,
  canvasY: number,
  viewport: Viewport,
): { x: number; y: number } => {
  return {
    x: canvasX * viewport.scale + viewport.x,
    y: canvasY * viewport.scale + viewport.y,
  };
};

// Calculate bounding box for an image considering rotation
export const calculateBoundingBox = (
  image: PlacedImage,
): { x: number; y: number; width: number; height: number } => {
  const { x, y, width, height, rotation } = image;

  // If no rotation, return simple bounding box
  if (!rotation || rotation === 0) {
    return {
      x,
      y,
      width,
      height,
    };
  }

  // Convert rotation from degrees to radians
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Calculate the four corners of the original rectangle
  const corners = [
    { x: 0, y: 0 }, // top-left
    { x: width, y: 0 }, // top-right
    { x: width, y: height }, // bottom-right
    { x: 0, y: height }, // bottom-left
  ];

  // Rotate each corner around the top-left corner (0,0)
  const rotatedCorners = corners.map((corner) => ({
    x: corner.x * cos - corner.y * sin,
    y: corner.x * sin + corner.y * cos,
  }));

  // Find the bounding box of the rotated corners
  const xs = rotatedCorners.map((c) => c.x);
  const ys = rotatedCorners.map((c) => c.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: x + minX,
    y: y + minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

// Crop an image to a normalized (0..1) sub-rectangle at full resolution and
// return a PNG data URL. Uses the CORS proxy for S3/GCS-hosted sources.
export const createCroppedImage = async (
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

// Read image files, size each to its natural dimensions, place at `position`
// (screen coords) or the viewport center, and hand each finished PlacedImage
// to `addImage`. Non-image files are ignored.
export const uploadFilesAsImages = (
  files: FileList,
  position: { x: number; y: number } | undefined,
  viewport: Viewport,
  canvasSize: { width: number; height: number },
  addImage: (img: PlacedImage) => void,
): void => {
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

          addImage({
            id: imageId,
            src: e.target?.result as string,
            x,
            y,
            width,
            height,
            rotation: 0,
          });
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  });
};
