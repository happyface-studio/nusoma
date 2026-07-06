import React from "react";
import type { PlacedImage } from "@/types/canvas";
import {
  canvasToScreen,
  calculateBoundingBox,
  type Viewport,
} from "@/utils/canvas-utils";

interface DimensionDisplayProps {
  selectedImages: PlacedImage[];
  viewport: Viewport;
  isDragging?: boolean;
}

export const DimensionDisplay: React.FC<DimensionDisplayProps> = ({
  selectedImages,
  viewport,
  isDragging = false,
}) => {
  // Move hooks to the top before any conditional returns
  const [apiDimensions, setApiDimensions] = React.useState<{
    width: number;
    height: number;
    isCropped: boolean;
  } | null>(null);

  // Only show for single image selection to avoid clutter
  const shouldShow = selectedImages.length === 1;
  const image = shouldShow ? selectedImages[0] : null;

  /**
   * Calculate the natural (API) dimensions that get sent to generation endpoints.
   * We show these instead of display dimensions because:
   * - They represent the actual pixel data AI models process
   * - They account for crops (cropWidth × naturalWidth)
   * - They're consistent regardless of canvas zoom/scaling
   * - Users need to know the true resolution for generation quality
   */
  const getApiDimensions = React.useCallback(async (img: PlacedImage) => {
    try {
      // Load the image to get natural dimensions
      const imgElement = new window.Image();
      imgElement.crossOrigin = "anonymous";
      imgElement.src = img.src;

      await new Promise((resolve) => {
        imgElement.onload = resolve;
      });

      // Calculate effective dimensions accounting for crops (same logic as generation handler)
      const cropWidth = img.cropWidth || 1;
      const cropHeight = img.cropHeight || 1;

      const effectiveWidth = cropWidth * imgElement.naturalWidth;
      const effectiveHeight = cropHeight * imgElement.naturalHeight;

      return {
        width: Math.round(effectiveWidth),
        height: Math.round(effectiveHeight),
        isCropped: cropWidth !== 1 || cropHeight !== 1,
      };
    } catch (error) {
      // Fallback to display dimensions if image loading fails
      return {
        width: Math.round(img.width),
        height: Math.round(img.height),
        isCropped: false,
      };
    }
  }, []);

  React.useEffect(() => {
    if (image) {
      getApiDimensions(image).then(setApiDimensions);
    } else {
      setApiDimensions(null);
    }
  }, [
    image?.src,
    image?.cropWidth,
    image?.cropHeight,
    image,
    getApiDimensions,
  ]);

  // Now do conditional rendering after all hooks
  if (!shouldShow || !image || !apiDimensions || isDragging) return null;

  // Get rotation-aware bottom center position using bounding box
  const boundingBox = calculateBoundingBox(image);
  const { x: screenX, y: screenY } = canvasToScreen(
    boundingBox.x + boundingBox.width / 2,
    boundingBox.y + boundingBox.height,
    viewport,
  );

  return (
    <div
      className="fixed pointer-events-none z-10 bg-background/90 backdrop-blur-sm border rounded-xl px-2 py-1 text-xs text-foreground/80 shadow-sm hidden md:block"
      style={{
        left: screenX,
        top: screenY + 8, // 8px below the image
        transform: "translateX(-50%)", // Center horizontally under the image
      }}
    >
      <div className="flex flex-col gap-0.5">
        <div className="font-medium">
          {apiDimensions.width} × {apiDimensions.height} px
        </div>
      </div>
    </div>
  );
};
