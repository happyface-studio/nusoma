import React, { useRef, useState, useEffect, useMemo } from "react";
import { Image as KonvaImage, Transformer } from "react-konva";
import Konva from "konva";
import useImage from "use-image";
import { useStreamingImage } from "@/hooks/useStreamingImage";
import type { PlacedImage } from "@/types/canvas";
import { throttle } from "@/utils/performance";

interface CanvasImageProps {
  image: PlacedImage;
  isSelected: boolean;
  onSelect: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onChange: (newAttrs: Partial<PlacedImage>) => void;
  onDragStart: () => void;
  onDragMove?: (
    e: any,
    newAttrs: Partial<PlacedImage>,
  ) => Partial<PlacedImage> | void;
  onDragEnd: () => void;
  onDoubleClick?: () => void;
  selectedIds: string[];
  images: PlacedImage[];
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  isDraggingImage: boolean;
  isCroppingImage: boolean;
  dragStartPositions: Map<string, { x: number; y: number }>;
}

export const CanvasImage: React.FC<CanvasImageProps> = ({
  image,
  isSelected,
  onSelect,
  onChange,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDoubleClick,
  selectedIds,
  images,
  setImages,
  isDraggingImage,
  isCroppingImage,
  dragStartPositions,
}) => {
  const shapeRef = useRef<Konva.Image>(null);
  const trRef = useRef<Konva.Transformer>(null);
  // Use streaming image hook for generated images to prevent flicker
  const [streamingImg] = useStreamingImage(image.isGenerated ? image.src : "");
  // Try with CORS first; if it fails, fall back to no-CORS load so the image still renders
  const [imgWithCORS, statusWithCORS] = useImage(
    image.isGenerated ? "" : image.src,
    "anonymous",
  );
  const [imgNoCORS, statusNoCORS] = useImage(
    image.isGenerated ? "" : image.src,
  );
  const img = image.isGenerated
    ? streamingImg
    : statusWithCORS === "loaded"
      ? imgWithCORS
      : statusWithCORS === "failed"
        ? imgNoCORS
        : imgWithCORS;
  const [isHovered, setIsHovered] = useState(false);
  const [isDraggable, setIsDraggable] = useState(true);

  useEffect(() => {
    if (
      isSelected &&
      selectedIds.length === 1 &&
      trRef.current &&
      shapeRef.current
    ) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
    }
  }, [isSelected, selectedIds.length]);

  return (
    <>
      <KonvaImage
        ref={shapeRef}
        id={image.id}
        image={img}
        x={image.x}
        y={image.y}
        width={image.width}
        height={image.height}
        rotation={image.rotation}
        crop={
          image.cropX !== undefined && !isCroppingImage
            ? {
                x: (image.cropX || 0) * (img?.naturalWidth || 0),
                y: (image.cropY || 0) * (img?.naturalHeight || 0),
                width: (image.cropWidth || 1) * (img?.naturalWidth || 0),
                height: (image.cropHeight || 1) * (img?.naturalHeight || 0),
              }
            : undefined
        }
        draggable={isDraggable}
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onDoubleClick}
        onDblTap={onDoubleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseDown={(e) => {
          // Only allow dragging with left mouse button (0)
          // Middle mouse (1) and right mouse (2) should not drag images
          const isLeftButton = e.evt.button === 0;
          setIsDraggable(isLeftButton);

          // For middle mouse button, don't stop propagation
          // Let it bubble up to the stage for canvas panning
          if (e.evt.button === 1) {
            return;
          }
        }}
        onMouseUp={() => {
          // Re-enable dragging after mouse up
          setIsDraggable(true);
        }}
        onDragStart={(e) => {
          // Stop propagation to prevent stage from being dragged
          e.cancelBubble = true;
          // Immediately detach transformer to allow dragging
          if (trRef.current) {
            trRef.current.nodes([]);
          }
          // Auto-select on drag if not already selected
          if (!isSelected) {
            onSelect(e);
          }
          onDragStart();
        }}
        onDragMove={useMemo(
          () =>
            throttle((e: any) => {
              const node = e.target;

              // Use custom onDragMove if provided (for snapping), otherwise use default behavior
              if (onDragMove) {
                const result = onDragMove(e, {
                  x: node.x(),
                  y: node.y(),
                });
                // If snapping returns adjusted coordinates, apply them to the node
                if (result) {
                  if (result.x !== undefined) node.x(result.x);
                  if (result.y !== undefined) node.y(result.y);
                }
              } else if (
                selectedIds.includes(image.id) &&
                selectedIds.length > 1
              ) {
                // Calculate delta from drag start position
                const startPos = dragStartPositions.get(image.id);
                if (startPos) {
                  const deltaX = node.x() - startPos.x;
                  const deltaY = node.y() - startPos.y;

                  // Update all selected items relative to their start positions
                  setImages((prev) =>
                    prev.map((img) => {
                      if (img.id === image.id) {
                        return { ...img, x: node.x(), y: node.y() };
                      } else if (selectedIds.includes(img.id)) {
                        const imgStartPos = dragStartPositions.get(img.id);
                        if (imgStartPos) {
                          return {
                            ...img,
                            x: imgStartPos.x + deltaX,
                            y: imgStartPos.y + deltaY,
                          };
                        }
                      }
                      return img;
                    }),
                  );
                }
              } else {
                onChange({
                  x: node.x(),
                  y: node.y(),
                });
              }
            }, 16), // ~60fps throttle, prevents Safari console errors
          [
            selectedIds,
            image.id,
            dragStartPositions,
            setImages,
            onChange,
            onDragMove,
          ],
        )}
        onDragEnd={(e) => {
          // Reattach transformer after drag ends
          if (
            isSelected &&
            selectedIds.length === 1 &&
            trRef.current &&
            shapeRef.current
          ) {
            trRef.current.nodes([shapeRef.current]);
          }
          // Ensure the layer redraws to update visual state
          const node = shapeRef.current;
          if (node) {
            node.getLayer()?.batchDraw();
          }
          onDragEnd();
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          if (node) {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();

            node.scaleX(1);
            node.scaleY(1);

            onChange({
              x: node.x(),
              y: node.y(),
              width: Math.max(5, node.width() * scaleX),
              height: Math.max(5, node.height() * scaleY),
              rotation: node.rotation(),
            });
          }
          onDragEnd();
        }}
        opacity={image.isGenerated ? 0.9 : 1}
        stroke={
          isDraggingImage
            ? "transparent"
            : isSelected
              ? "#3b82f6"
              : isHovered
                ? "#3b82f6"
                : "transparent"
        }
        strokeWidth={isDraggingImage ? 0 : isSelected || isHovered ? 1 : 0}
      />
      {isSelected && selectedIds.length === 1 && (
        <Transformer
          ref={trRef}
          ignoreStroke={true}
          visible={!isDraggingImage}
          rotateEnabled={true}
          rotateAnchorOffset={20}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotationSnapTolerance={5}
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
            "middle-left",
            "middle-right",
            "top-center",
            "bottom-center",
          ]}
          anchorCornerRadius={2}
          anchorSize={8}
          anchorStrokeWidth={1}
          borderStroke="#3b82f6"
          borderStrokeWidth={1}
          anchorStroke="#3b82f6"
          anchorFill="#ffffff"
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 2 || newBox.height < 2) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};
