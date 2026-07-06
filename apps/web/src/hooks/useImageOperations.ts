import { useCallback } from "react";
import { id } from "@instantdb/react";
import { PlacedImage } from "@/types/canvas";

interface UseImageOperationsProps {
  images: PlacedImage[];
  selectedIds: string[];
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  saveToHistory: () => void;
}

export function useImageOperations({
  images,
  selectedIds,
  setImages,
  setSelectedIds,
  saveToHistory,
}: UseImageOperationsProps) {
  // Combine multiple images into one
  const handleCombineImages = useCallback(async () => {
    if (selectedIds.length < 2) return;

    saveToHistory();

    const selectedImages = selectedIds
      .map((id) => images.find((img) => img.id === id))
      .filter((img) => img !== undefined) as PlacedImage[];

    const sortedImages = [...selectedImages].sort((a, b) => {
      const indexA = images.findIndex((img) => img.id === a.id);
      const indexB = images.findIndex((img) => img.id === b.id);
      return indexA - indexB;
    });

    const imageElements: {
      img: PlacedImage;
      element: HTMLImageElement;
      scale: number;
    }[] = [];
    let maxScale = 1;

    for (const img of sortedImages) {
      const imgElement = new window.Image();
      imgElement.crossOrigin = "anonymous";

      // Use proxy for S3 URLs to bypass CORS
      const needsProxy =
        img.src.includes("instant-storage.s3.amazonaws.com") ||
        img.src.includes("storage.googleapis.com");

      imgElement.src = needsProxy
        ? `/api/proxy-image?url=${encodeURIComponent(img.src)}`
        : img.src;
      await new Promise((resolve) => {
        imgElement.onload = resolve;
      });

      const effectiveWidth = img.cropWidth
        ? imgElement.naturalWidth * img.cropWidth
        : imgElement.naturalWidth;
      const effectiveHeight = img.cropHeight
        ? imgElement.naturalHeight * img.cropHeight
        : imgElement.naturalHeight;

      const scaleX = effectiveWidth / img.width;
      const scaleY = effectiveHeight / img.height;
      const scale = Math.min(scaleX, scaleY);

      maxScale = Math.max(maxScale, scale);
      imageElements.push({ img, element: imgElement, scale });
    }

    const optimalScale = Math.min(maxScale, 4);

    let minX = Infinity,
      minY = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity;

    sortedImages.forEach((img) => {
      minX = Math.min(minX, img.x);
      minY = Math.min(minY, img.y);
      maxX = Math.max(maxX, img.x + img.width);
      maxY = Math.max(maxY, img.y + img.height);
    });

    const combinedWidth = maxX - minX;
    const combinedHeight = maxY - minY;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      console.error("Failed to get canvas context");
      return;
    }

    canvas.width = Math.round(combinedWidth * optimalScale);
    canvas.height = Math.round(combinedHeight * optimalScale);

    for (const { img, element: imgElement } of imageElements) {
      const relX = (img.x - minX) * optimalScale;
      const relY = (img.y - minY) * optimalScale;
      const scaledWidth = img.width * optimalScale;
      const scaledHeight = img.height * optimalScale;

      ctx.save();

      if (img.rotation) {
        ctx.translate(relX + scaledWidth / 2, relY + scaledHeight / 2);
        ctx.rotate((img.rotation * Math.PI) / 180);
        ctx.drawImage(
          imgElement,
          -scaledWidth / 2,
          -scaledHeight / 2,
          scaledWidth,
          scaledHeight,
        );
      } else {
        if (
          img.cropX !== undefined &&
          img.cropY !== undefined &&
          img.cropWidth !== undefined &&
          img.cropHeight !== undefined
        ) {
          ctx.drawImage(
            imgElement,
            img.cropX * imgElement.naturalWidth,
            img.cropY * imgElement.naturalHeight,
            img.cropWidth * imgElement.naturalWidth,
            img.cropHeight * imgElement.naturalHeight,
            relX,
            relY,
            scaledWidth,
            scaledHeight,
          );
        } else {
          ctx.drawImage(
            imgElement,
            0,
            0,
            imgElement.naturalWidth,
            imgElement.naturalHeight,
            relX,
            relY,
            scaledWidth,
            scaledHeight,
          );
        }
      }

      ctx.restore();
    }

    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), "image/png");
    });

    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve) => {
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(blob);
    });

    const combinedImage: PlacedImage = {
      id: id(),
      src: dataUrl,
      x: minX,
      y: minY,
      width: combinedWidth,
      height: combinedHeight,
      rotation: 0,
    };

    setImages((prev) => [
      ...prev.filter((img) => !selectedIds.includes(img.id)),
      combinedImage,
    ]);

    setSelectedIds([combinedImage.id]);
  }, [selectedIds, images, setImages, setSelectedIds, saveToHistory]);

  return {
    handleCombineImages,
  };
}
