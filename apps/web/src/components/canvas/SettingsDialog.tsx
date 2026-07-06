"use client";

import React from "react";
import { useTheme } from "next-themes";
import {
  MonitorIcon,
  SunIcon,
  MoonIcon,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  TooltipTrigger,
  TooltipContent,
  Tooltip,
} from "@/components/ui/tooltip";

interface SettingsDialogProps {
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  canvasStorage: any;
  setImages: React.Dispatch<React.SetStateAction<any[]>>;
  setViewport: (viewport: { x: number; y: number; scale: number }) => void;
  toast: any;
}

export function SettingsDialog({
  showGrid,
  setShowGrid,
  canvasStorage,
  setImages,
  setViewport,
  toast,
}: SettingsDialogProps) {
  const { theme, setTheme } = useTheme();

  const handleClearCanvas = async () => {
    if (confirm("Clear all saved data? This cannot be undone.")) {
      await canvasStorage.clearAll();
      setImages([]);
      setViewport({ x: 0, y: 0, scale: 1 });
      toast.add({
        title: "Storage cleared",
        description: "All saved data has been removed",
      });
    }
  };

  return (
    <Dialog>
      <Tooltip>
        <DialogTrigger
          render={({ ref, ...dialogProps }) => (
            <Button
              {...dialogProps}
              ref={ref}
              variant="secondary"
              size="icon-sm"
              className="relative"
              render={<TooltipTrigger />}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          )}
        />
        <TooltipContent>
          <span>Settings</span>
        </TooltipContent>
      </Tooltip>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="h-px bg-border/40" />

          {/* Appearance */}
          <div className="flex justify-between">
            <div className="flex flex-col gap-2">
              <Label htmlFor="appearance">Appearance</Label>
              <p className="text-sm text-muted-foreground">
                Customize how nusoma looks on your device.
              </p>
            </div>
            <Select
              value={theme || "system"}
              onValueChange={(value) =>
                setTheme(value as "system" | "light" | "dark")
              }
            >
              <SelectTrigger className="max-w-[140px] rounded-xl">
                <div className="flex items-center gap-2">
                  {theme === "light" ? (
                    <SunIcon className="size-4" />
                  ) : theme === "dark" ? (
                    <MoonIcon className="size-4" />
                  ) : (
                    <MonitorIcon className="size-4" />
                  )}
                  <span className="capitalize">{theme || "system"}</span>
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="system" className="rounded-lg">
                  <div className="flex items-center gap-2">
                    <MonitorIcon className="size-4" />
                    <span>System</span>
                  </div>
                </SelectItem>
                <SelectItem value="light" className="rounded-lg">
                  <div className="flex items-center gap-2">
                    <SunIcon className="size-4" />
                    <span>Light</span>
                  </div>
                </SelectItem>
                <SelectItem value="dark" className="rounded-lg">
                  <div className="flex items-center gap-2">
                    <MoonIcon className="size-4" />
                    <span>Dark</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Grid */}
          <div className="flex justify-between">
            <div className="flex flex-col gap-2">
              <Label htmlFor="grid">Show Grid</Label>
              <p className="text-sm text-muted-foreground">
                Show a grid on the canvas to help you align your images.
              </p>
            </div>
            <Switch
              id="grid"
              checked={showGrid}
              onCheckedChange={setShowGrid}
            />
          </div>

          {/* Minimap -- Disabled for now
          <div className="flex justify-between">
            <div className="flex flex-col gap-2">
              <Label htmlFor="minimap">Show Minimap</Label>
              <p className="text-sm text-muted-foreground">
                Show a minimap in the corner to navigate the canvas.
              </p>
            </div>
            <Switch
              id="minimap"
              checked={showMinimap}
              onCheckedChange={setShowMinimap}
            />
          </div>
          */}

          <div className="h-px bg-border/40" />

          {/* Clear Canvas */}
          <div className="flex justify-between items-center">
            <div className="flex flex-col gap-2">
              <Label htmlFor="clear-canvas">Clear Canvas</Label>
              <p className="text-sm text-muted-foreground">
                Remove all images and reset the canvas. This action cannot be
                undone.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearCanvas}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear All</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
