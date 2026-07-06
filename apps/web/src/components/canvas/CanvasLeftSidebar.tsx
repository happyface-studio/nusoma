"use client";

import React from "react";
import { motion } from "motion/react";
import {
  ImageIcon,
  VideoIcon,
  FileIcon,
  PanelLeftClose,
  History as HistoryIcon,
  Clock,
} from "lucide-react";
import { PlacedImage, PlacedVideo } from "@/types/canvas";
import { cn } from "@/lib/utils";
import { Logo, LogoIcon } from "@/components/icons";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
  SheetHeader,
} from "@/components/ui/Sheet";
import { Button } from "@/components/ui/button";
import {
  UnderlinedTabs,
  UnderlinedTabsList,
  UnderlinedTabsTrigger,
  UnderlinedTabsContent,
} from "@/components/ui/tabs";
import type { HistoryState } from "@/hooks/useCanvasHistory";

interface CanvasLeftSidebarProps {
  images: PlacedImage[];
  videos: PlacedVideo[];
  selectedIds: string[];
  onAssetClick: (id: string, x: number, y: number) => void;
  onAssetSelect: (id: string, isMultiSelect: boolean) => void;
  projectName?: string;
  folderName?: string;
  history?: HistoryState[];
  historyIndex?: number;
  onRestoreHistory?: (index: number) => void;
}

export function CanvasLeftSidebar({
  images,
  videos,
  selectedIds,
  onAssetClick,
  onAssetSelect,
  projectName = "Untitled",
  folderName = "Drafts",
  history = [],
  historyIndex = -1,
  onRestoreHistory,
}: CanvasLeftSidebarProps) {
  const allAssets = [
    ...images.map((img) => ({ ...img, type: "image" as const })),
    ...videos.map((vid) => ({ ...vid, type: "video" as const })),
  ].sort((a, b) => {
    // Sort by creation time if available, otherwise by ID
    return a.id.localeCompare(b.id);
  });

  const formatTimestamp = (timestamp: Date) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Sheet>
      <SheetTrigger
        render={(triggerProps) => (
          <Button
            {...triggerProps}
            className={cn(
              "flex items-center justify-center fixed top-4 left-4 z-30 gap-4 px-4 py-2 h-auto rounded-xl bg-card backdrop-blur-lg border border-border",
              "shadow-[0_0_0_1px_rgba(50,50,50,0.12),0_4px_8px_-0.5px_rgba(50,50,50,0.04),0_8px_16px_-2px_rgba(50,50,50,0.02)] hover:bg-muted",
            )}
          >
            <LogoIcon style={{ width: "24px", height: "24px" }} />
            <div className="flex flex-col items-start min-w-0">
              <div
                className="text-xs font-semibold truncate"
                title={projectName}
              >
                {projectName || "Untitled"}
              </div>
              <div
                className="text-[10px] text-muted-foreground truncate"
                title={folderName || "Drafts"}
              >
                {folderName || "Drafts"}
              </div>
            </div>
          </Button>
        )}
      />

      <SheetContent side="left">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Logo className="h-6 w-auto shrink-0 text-foreground" />
            <SheetClose
              className="ml-auto inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted text-muted-foreground"
              aria-label="Hide sidebar"
              title="Hide sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </SheetClose>
          </div>
          <div className="flex flex-col min-w-0 mt-6">
            <div className="text-md font-semibold truncate" title={projectName}>
              {projectName || "Untitled"}
            </div>
            <div
              className="text-sm text-muted-foreground truncate"
              title={folderName || "Drafts"}
            >
              {folderName || "Drafts"}
            </div>
          </div>
        </SheetHeader>

        {/* Tabs */}
        <UnderlinedTabs
          defaultValue="assets"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <UnderlinedTabsList className="border-b border-border px-2">
            <UnderlinedTabsTrigger
              value="assets"
              className="flex items-center gap-2"
            >
              <FileIcon className="w-3.5 h-3.5" />
              <span>Assets</span>
              <span className="text-[10px] opacity-70">{allAssets.length}</span>
            </UnderlinedTabsTrigger>
            <UnderlinedTabsTrigger
              value="history"
              className="flex items-center gap-2"
            >
              <HistoryIcon className="w-3.5 h-3.5" />
              <span>History</span>
              <span className="text-[10px] opacity-70">{history.length}</span>
            </UnderlinedTabsTrigger>
          </UnderlinedTabsList>

          {/* Assets Tab Content */}
          <UnderlinedTabsContent
            value="assets"
            className="flex-1 overflow-y-auto p-2 space-y-1"
          >
            {allAssets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <ImageIcon className="w-12 h-12 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No assets yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Upload or generate images to get started
                </p>
              </div>
            ) : (
              allAssets.map((asset) => (
                <motion.button
                  key={asset.id}
                  onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                      onAssetSelect(asset.id, true);
                    } else {
                      onAssetSelect(asset.id, false);
                      onAssetClick(asset.id, asset.x, asset.y);
                    }
                  }}
                  className={cn(
                    "w-full p-2 rounded-lg border transition-all duration-200 hover:border-primary/50",
                    "flex items-center gap-3 group",
                    selectedIds.includes(asset.id)
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:bg-muted/50",
                  )}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Thumbnail */}
                  <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0">
                    {asset.type === "image" ? (
                      <img
                        src={asset.src}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="relative w-full h-full">
                        <video
                          src={asset.src}
                          className="w-full h-full object-cover"
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <VideoIcon className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-1 mb-1">
                      {asset.type === "image" ? (
                        <ImageIcon className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <VideoIcon className="w-3 h-3 text-muted-foreground" />
                      )}
                      <span className="text-xs font-medium truncate">
                        {asset.type === "image" ? "Image" : "Video"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>
                        {Math.round(asset.width)} × {Math.round(asset.height)}
                      </div>
                      <div className="truncate">
                        x: {Math.round(asset.x)}, y: {Math.round(asset.y)}
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))
            )}
          </UnderlinedTabsContent>

          {/* History Tab Content */}
          <UnderlinedTabsContent
            value="history"
            className="flex-1 overflow-y-auto p-2 space-y-1"
          >
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <HistoryIcon className="w-12 h-12 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No history yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Make changes to your canvas to create history
                </p>
              </div>
            ) : (
              // Show history in reverse order (most recent first)
              [...history].reverse().map((snapshot, reverseIndex) => {
                // Calculate the actual index in the original array
                const actualIndex = history.length - 1 - reverseIndex;
                const isCurrentVersion = actualIndex === historyIndex;
                const imageCount = snapshot.images?.length || 0;
                const videoCount = snapshot.videos?.length || 0;
                const totalAssets = imageCount + videoCount;

                // Get first image as thumbnail
                const firstImage = snapshot.images?.[0];
                const firstVideo = snapshot.videos?.[0];

                return (
                  <motion.button
                    key={actualIndex}
                    onClick={() => {
                      if (onRestoreHistory && actualIndex !== historyIndex) {
                        onRestoreHistory(actualIndex);
                      }
                    }}
                    className={cn(
                      "w-full p-2 rounded-lg border transition-all duration-200",
                      "flex items-start gap-3 group",
                      isCurrentVersion
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-muted/50 hover:border-primary/50",
                      actualIndex !== historyIndex && "cursor-pointer",
                    )}
                    whileHover={
                      actualIndex !== historyIndex ? { scale: 1.02 } : {}
                    }
                    whileTap={
                      actualIndex !== historyIndex ? { scale: 0.98 } : {}
                    }
                  >
                    {/* Thumbnail */}
                    <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted shrink-0">
                      {firstImage ? (
                        <img
                          src={firstImage.src}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : firstVideo ? (
                        <div className="relative w-full h-full">
                          <video
                            src={firstVideo.src}
                            className="w-full h-full object-cover"
                            muted
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                            <VideoIcon className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                        </div>
                      )}
                      {isCurrentVersion && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/20 border-2 border-primary rounded-md">
                          <Clock className="w-4 h-4 text-primary" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-xs font-medium truncate">
                          {isCurrentVersion
                            ? "Current Version"
                            : `Version ${actualIndex + 1}`}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {snapshot.timestamp && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span className="text-[10px]">
                              {formatTimestamp(snapshot.timestamp)}
                            </span>
                          </div>
                        )}
                        <div className="text-[10px]">
                          {imageCount > 0 &&
                            `${imageCount} image${imageCount !== 1 ? "s" : ""}`}
                          {imageCount > 0 && videoCount > 0 && ", "}
                          {videoCount > 0 &&
                            `${videoCount} video${videoCount !== 1 ? "s" : ""}`}
                          {totalAssets === 0 && "Empty canvas"}
                        </div>
                      </div>
                    </div>
                  </motion.button>
                );
              })
            )}
          </UnderlinedTabsContent>
        </UnderlinedTabs>
      </SheetContent>
    </Sheet>
  );
}
