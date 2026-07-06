"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  PlayIcon,
  Copy,
  Trash2,
  Scissors,
  Layers,
  Wand2,
  VideoIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronUp,
  ImagePlus,
  Eraser,
} from "lucide-react";
import { PlacedImage, PlacedVideo, GenerationSettings } from "@/types/canvas";

interface CanvasRightSidebarProps {
  selectedIds: string[];
  images: PlacedImage[];
  videos: PlacedVideo[];
  isGenerating: boolean;
  generationSettings: GenerationSettings;
  isolateInputValue: string;
  isIsolating: boolean;
  handleRun: () => void;
  handleDuplicate: () => void;
  handleRemoveBackground: () => void;
  handleCombineImages: () => void;
  handleDelete: () => void;
  handleIsolate: () => void;
  handleConvertToVideo: (imageId: string) => void;
  handleVideoToVideo: (videoId: string) => void;
  handleExtendVideo: (videoId: string) => void;
  handleRemoveVideoBackground: (videoId: string) => void;
  setCroppingImageId: (id: string | null) => void;
  setIsolateInputValue: (value: string) => void;
  setIsolateTarget: (id: string | null) => void;
  sendToFront: () => void;
  sendToBack: () => void;
  bringForward: () => void;
  sendBackward: () => void;
}

export function CanvasRightSidebar({
  selectedIds,
  images,
  videos,
  isGenerating,
  generationSettings,
  isolateInputValue,
  isIsolating,
  handleRun,
  handleDuplicate,
  handleRemoveBackground,
  handleCombineImages,
  handleDelete,
  handleIsolate,
  handleConvertToVideo,
  handleVideoToVideo,
  handleExtendVideo,
  handleRemoveVideoBackground,
  setCroppingImageId,
  setIsolateInputValue,
  setIsolateTarget,
  sendToFront,
  sendToBack,
  bringForward,
  sendBackward,
}: CanvasRightSidebarProps) {
  const hasSelection = selectedIds.length > 0;
  const isSingleSelection = selectedIds.length === 1;
  const isMultiSelection = selectedIds.length > 1;

  const selectedImages = images.filter((img) => selectedIds.includes(img.id));
  const selectedVideos = videos.filter((vid) => selectedIds.includes(vid.id));
  const hasOnlyImages =
    selectedImages.length > 0 && selectedVideos.length === 0;
  const hasOnlyVideos =
    selectedVideos.length > 0 && selectedImages.length === 0;
  const hasMixed = selectedImages.length > 0 && selectedVideos.length > 0;

  return (
    <div className="w-64 border-l border-border bg-background/95 backdrop-blur-lg flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Actions</h2>
        </div>
      </div>

      {/* Actions */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!hasSelection ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <Wand2 className="w-12 h-12 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No selection</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Select an element to see actions
            </p>
          </div>
        ) : (
          <>
            {/* Generation Actions 
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Generate
              </h3>
              <Button
                onClick={handleRun}
                disabled={isGenerating || !generationSettings.prompt.trim()}
                className="w-full justify-start gap-2"
                variant="default"
              >
                <PlayIcon className="h-4 w-4" />
                Run Generation
              </Button>
            </div>

            <Separator />
            */}

            {/* Image Actions */}
            {hasOnlyImages && (
              <>
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Image Actions
                  </h3>

                  <Button
                    onClick={handleRemoveBackground}
                    disabled={!isSingleSelection}
                    className="w-full justify-start gap-2"
                    variant="secondary"
                  >
                    <Eraser className="h-4 w-4" />
                    Remove Background
                  </Button>

                  {isSingleSelection && (
                    <>
                      <Button
                        onClick={() => setCroppingImageId(selectedIds[0])}
                        className="w-full justify-start gap-2"
                        variant="secondary"
                      >
                        <Scissors className="h-4 w-4" />
                        Crop Image
                      </Button>

                      <div className="space-y-2">
                        <Input
                          placeholder="Object to isolate..."
                          value={isolateInputValue}
                          onChange={(e) => setIsolateInputValue(e.target.value)}
                          onFocus={() => setIsolateTarget(selectedIds[0])}
                          className="text-sm"
                        />
                        <Button
                          onClick={handleIsolate}
                          disabled={isIsolating || !isolateInputValue.trim()}
                          className="w-full justify-start gap-2"
                          variant="secondary"
                        >
                          <Wand2 className="h-4 w-4" />
                          {isIsolating ? "Isolating..." : "Isolate Object"}
                        </Button>
                      </div>

                      <Button
                        onClick={() => handleConvertToVideo(selectedIds[0])}
                        className="w-full justify-start gap-2"
                        variant="secondary"
                      >
                        <VideoIcon className="h-4 w-4" />
                        Convert to Video
                      </Button>
                    </>
                  )}

                  {isMultiSelection && (
                    <Button
                      onClick={handleCombineImages}
                      className="w-full justify-start gap-2"
                      variant="secondary"
                    >
                      <ImagePlus className="h-4 w-4" />
                      Combine Images
                    </Button>
                  )}
                </div>

                <Separator />
              </>
            )}

            {/* Video Actions */}
            {hasOnlyVideos && isSingleSelection && (
              <>
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Video Actions
                  </h3>

                  <Button
                    onClick={() => handleVideoToVideo(selectedIds[0])}
                    className="w-full justify-start gap-2"
                    variant="secondary"
                  >
                    <VideoIcon className="h-4 w-4" />
                    Transform Video
                  </Button>

                  <Button
                    onClick={() => handleExtendVideo(selectedIds[0])}
                    className="w-full justify-start gap-2"
                    variant="secondary"
                  >
                    <VideoIcon className="h-4 w-4" />
                    Extend Video
                  </Button>

                  <Button
                    onClick={() => handleRemoveVideoBackground(selectedIds[0])}
                    className="w-full justify-start gap-2"
                    variant="secondary"
                  >
                    <Eraser className="h-4 w-4" />
                    Remove Background
                  </Button>
                </div>

                <Separator />
              </>
            )}

            {/* Layer Actions */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Arrange
              </h3>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={sendToFront}
                  className="w-full justify-start gap-2 text-xs"
                  variant="secondary"
                  size="sm"
                >
                  <ArrowUpFromLine className="h-3 w-3" />
                  To Front
                </Button>

                <Button
                  onClick={sendToBack}
                  className="w-full justify-start gap-2 text-xs"
                  variant="secondary"
                  size="sm"
                >
                  <ArrowDownToLine className="h-3 w-3" />
                  To Back
                </Button>

                <Button
                  onClick={bringForward}
                  className="w-full justify-start gap-2 text-xs"
                  variant="secondary"
                  size="sm"
                >
                  <ChevronUp className="h-3 w-3" />
                  Forward
                </Button>

                <Button
                  onClick={sendBackward}
                  className="w-full justify-start gap-2 text-xs"
                  variant="secondary"
                  size="sm"
                >
                  <ChevronDown className="h-3 w-3" />
                  Backward
                </Button>
              </div>
            </div>

            <Separator />

            {/* Basic Actions */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Basic
              </h3>

              <Button
                onClick={handleDuplicate}
                className="w-full justify-start gap-2"
                variant="secondary"
              >
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>

              <Button
                onClick={handleDelete}
                className="w-full justify-start gap-2 bg-destructive/10 text-destructive hover:bg-destructive/20"
                variant="secondary"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>

            {/* Selection Info */}
            <div className="mt-auto pt-4 border-t border-border">
              <div className="text-xs text-muted-foreground space-y-1">
                <div>Selected: {selectedIds.length}</div>
                {selectedImages.length > 0 && (
                  <div>Images: {selectedImages.length}</div>
                )}
                {selectedVideos.length > 0 && (
                  <div>Videos: {selectedVideos.length}</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
