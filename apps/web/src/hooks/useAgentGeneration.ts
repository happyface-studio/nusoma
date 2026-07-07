import { useEffect, useState } from "react";
import { findOpenSpot, dimsForOutput, type Rect } from "@/lib/canvas-placement";
import { getVideoModelById } from "@/lib/models-config";
import type {
  PlacedImage,
  PlacedVideo,
  GenerationSettings,
} from "@/types/canvas";
import type { useAgentRun } from "@/hooks/useAgentRun";

export type GeneratingSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "image" | "video";
};

// Owns the single reserved slot for an in-flight agent run and the run trigger.
// The slot drives the in-canvas loading placeholder AND is sent to the server as
// `placement` so the finished asset lands exactly where the placeholder sat.
export function useAgentGeneration(opts: {
  projectId: string;
  images: PlacedImage[];
  videos: PlacedVideo[];
  generationSettings: GenerationSettings;
  startAgentRun: ReturnType<typeof useAgentRun>["start"];
  agentStatus: ReturnType<typeof useAgentRun>["status"];
}): {
  generatingSlot: GeneratingSlot | null;
  handleRun: () => Promise<void>;
} {
  const {
    projectId,
    images,
    videos,
    generationSettings,
    startAgentRun,
    agentStatus,
  } = opts;

  // The single slot reserved for the current agent run: drives the in-canvas
  // loading placeholder AND is sent to the server so the asset lands in the exact
  // same spot. null when no run is in flight.
  const [generatingSlot, setGeneratingSlot] = useState<GeneratingSlot | null>(
    null,
  );

  // Drive the in-canvas loading animation (GeneratingPlaceholder) from the agent's
  // event stream — one placeholder per `generate` that's been requested but hasn't
  // returned yet. When the generate finishes, the real asset arrives via the
  // reactive merge above and the placeholder count drops back to zero.
  // ponytail: pairs generate requests to results by shape (toolName / assetId /
  // error) and assumes `generate` is the only canvas-affecting tool — true for eve
  // today. Position mirrors persistAgentAsset's stagger so the placeholder lands
  // where the asset will; size defaults to the server's 1024² image default.
  // Clear the reserved slot the moment its asset lands. The server places the
  // asset at the slot's exact position, so an element appearing there is the
  // hand-off signal — the placeholder disappears as the real asset takes its
  // place, with no gap and no jump. findOpenSpot guaranteed the slot was empty at
  // reservation, so nothing else can be sitting there.
  useEffect(() => {
    if (!generatingSlot) return;
    const landed = [...images, ...videos].some(
      (el) =>
        Math.abs(el.x - generatingSlot.x) < 1 &&
        Math.abs(el.y - generatingSlot.y) < 1,
    );
    if (landed) setGeneratingSlot(null);
  }, [images, videos, generatingSlot]);

  // Safety net: never leave a placeholder stuck. On failure clear immediately; on
  // completion give the reactive query a beat to deliver the asset (which clears
  // the slot above) before clearing a run that produced nothing.
  useEffect(() => {
    if (agentStatus === "failed") {
      setGeneratingSlot(null);
      return;
    }
    if (agentStatus === "done") {
      const t = setTimeout(() => setGeneratingSlot(null), 800);
      return () => clearTimeout(t);
    }
  }, [agentStatus]);

  // Handle context menu actions
  const handleRun = async () => {
    if (!projectId) return;
    // Mirror the legacy handler's image/video detection (see
    // src/lib/handlers/generation-handler.ts): a modelId that resolves to a
    // known video model means this run targets video generation.
    const kind: "image" | "video" =
      generationSettings.modelId &&
      getVideoModelById(generationSettings.modelId)
        ? "video"
        : "image";

    // Reserve a correctly-sized, non-overlapping spot up front so the loading
    // placeholder appears instantly on click and the server can place the asset
    // in the exact same place (sent as `placement`).
    const { width, height } = dimsForOutput(generationSettings.imageSize, kind);
    const occupied: Rect[] = [...images, ...videos].map((el) => ({
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
    }));
    const { x, y } = findOpenSpot(occupied, width, height);
    setGeneratingSlot({ x, y, width, height, kind });

    await startAgentRun({
      projectId,
      brief: generationSettings.prompt ?? "",
      kind,
      aspectRatio: generationSettings.imageSize,
      referencedAssetIds: generationSettings.referencedAssetIds,
      placement: { x, y, width, height },
    });
  };

  return { generatingSlot, handleRun };
}
