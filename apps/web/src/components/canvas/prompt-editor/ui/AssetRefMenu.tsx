import React from "react";
import { Dialog, DottedDialogContent } from "@/components/ui/dialog";
import { PlayIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlacedImage, PlacedVideo } from "@/types/canvas";

interface ReferenceableAsset extends Omit<PlacedImage, "type"> {
  type: "image" | "video";
}

interface AssetRefMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filteredAssets: (PlacedImage | PlacedVideo)[];
  referencedAssetIds: string[];
  selectedIndex: number;
  onSelect: (asset: PlacedImage | PlacedVideo) => void;
}

export const AssetRefMenu = ({
  open,
  onOpenChange,
  filteredAssets,
  referencedAssetIds,
  selectedIndex,
  onSelect,
}: AssetRefMenuProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DottedDialogContent
        className="overflow-hidden p-0 w-full max-w-[95vw] sm:max-w-[90vw] lg:max-w-2xl"
        showCloseButton={false}
      >
        <div className="overflow-y-auto max-h-[80vh]">
          <div className="px-4 py-3 text-sm font-semibold text-muted-foreground bg-muted/50 backdrop-blur-2xl sticky top-0 z-10 flex items-center justify-between">
            <span>📷 Select Asset to Reference</span>
            <span className="text-xs font-normal">
              {referencedAssetIds.length}/6 assets referenced
            </span>
          </div>
          {filteredAssets.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No available assets found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-4">
              {filteredAssets.map((asset, index) => {
                // Determine if it is a video based on 'isVideo' property or type discriminator if added
                const isVideo =
                  (asset as any).isVideo || (asset as any).type === "video";
                const displayLabel = isVideo ? "Video" : "Image";

                return (
                  <button
                    key={asset.id}
                    onClick={() => onSelect(asset)}
                    className={cn(
                      "relative aspect-square rounded-lg border-2 overflow-hidden hover:border-cyan-500 transition-colors",
                      index === selectedIndex
                        ? "border-cyan-500 ring-2 ring-cyan-500/30"
                        : "border-border",
                    )}
                  >
                    <img
                      src={asset.src}
                      alt={`${displayLabel}`}
                      className="w-full h-full object-cover"
                    />
                    {isVideo && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <PlayIcon className="h-8 w-8 text-white opacity-80" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/70 to-transparent p-2">
                      <span className="text-white text-xs font-medium">
                        {displayLabel}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DottedDialogContent>
    </Dialog>
  );
};
