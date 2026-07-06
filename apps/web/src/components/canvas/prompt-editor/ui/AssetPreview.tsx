import React from "react";
import { PlayIcon } from "lucide-react";
import type { PlacedImage, PlacedVideo } from "@/types/canvas";

interface AssetPreviewProps {
  selectedIds: string[];
  images: PlacedImage[];
  videos?: PlacedVideo[];
}

export const AssetPreview = ({
  selectedIds,
  images,
  videos = [],
}: AssetPreviewProps) => {
  if (selectedIds.length === 0) return null;

  return (
    <div className="absolute top-4 right-4 flex items-center justify-end">
      <div className="relative h-12 w-20">
        {selectedIds.slice(0, 3).map((id, index) => {
          const image = images.find((img) => img.id === id);
          const video = videos?.find((vid) => vid.id === id);
          const asset = image || video;

          if (!asset) return null;

          const isLast = index === Math.min(selectedIds.length - 1, 2);
          const offset = index * 8;
          const size = 40 - index * 4;
          const topOffset = index * 2;
          const isVideo = !!video;

          return (
            <div
              key={id}
              className="absolute rounded-lg border border-border/20 bg-background overflow-hidden"
              style={{
                right: `${offset}px`,
                top: `${topOffset}px`,
                zIndex: 3 - index,
                width: `${size}px`,
                height: `${size}px`,
              }}
            >
              <img
                src={asset.src}
                alt=""
                className="w-full h-full object-cover"
              />
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded">
                  <PlayIcon className="h-3 w-3 text-white" />
                </div>
              )}
              {isLast && selectedIds.length > 3 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="text-white text-xs font-medium">
                    +{selectedIds.length - 3}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
