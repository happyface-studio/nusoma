import {
  ImageIcon,
  VideoIcon,
  AudioLinesIcon,
  BoxIcon,
  type LucideIcon,
} from "lucide-react";
import colors from "tailwindcss/colors";

// ============================================
// Core Generation Types
// ============================================

export type GenerationType = "image" | "video" | "audio" | "3d";
type TailwindColorKey = "orange" | "purple" | "green" | "cyan";

export interface GenerationTypeConfig {
  id: GenerationType;
  label: string;
  icon: LucideIcon;
  color: TailwindColorKey;
}

export const generationTypeConfigs: Record<
  GenerationType,
  GenerationTypeConfig
> = {
  image: {
    id: "image",
    label: "Image",
    icon: ImageIcon,
    color: "orange",
  },
  video: {
    id: "video",
    label: "Video",
    icon: VideoIcon,
    color: "purple",
  },
  audio: {
    id: "audio",
    label: "Audio",
    icon: AudioLinesIcon,
    color: "green",
  },
  "3d": {
    id: "3d",
    label: "3D",
    icon: BoxIcon,
    color: "cyan",
  },
};

// ============================================
// Generation Modes (Input -> Output)
// ============================================

export type GenerationModeId =
  | "text-to-image"
  | "text-to-video"
  | "text-to-audio"
  | "text-to-3d"
  | "image-to-image"
  | "image-to-video"
  | "image-to-3d"
  | "video-to-3d"
  | "3d-to-image";

export interface GenerationMode {
  id: GenerationModeId;
  label: string;
  shortLabel: string;
  input: "text" | GenerationType;
  output: GenerationType;
  description: string;
  /** Whether this mode requires a selected asset */
  requiresInput: boolean;
  /** The type of input asset required (if any) */
  inputAssetType?: GenerationType;
  /** Whether this mode is currently available */
  enabled: boolean;
}

export const generationModes: Record<GenerationModeId, GenerationMode> = {
  // Text-to-X modes
  "text-to-image": {
    id: "text-to-image",
    label: "Text to Image",
    shortLabel: "Generate Image",
    input: "text",
    output: "image",
    description: "Generate images from text prompts",
    requiresInput: false,
    enabled: true,
  },
  "text-to-video": {
    id: "text-to-video",
    label: "Text to Video",
    shortLabel: "Generate Video",
    input: "text",
    output: "video",
    description: "Generate videos from text prompts",
    requiresInput: false,
    enabled: true, // Coming soon
  },
  "text-to-audio": {
    id: "text-to-audio",
    label: "Text to Audio",
    shortLabel: "Generate Audio",
    input: "text",
    output: "audio",
    description: "Generate audio from text prompts",
    requiresInput: false,
    enabled: false, // Coming soon
  },
  "text-to-3d": {
    id: "text-to-3d",
    label: "Text to 3D",
    shortLabel: "Generate 3D",
    input: "text",
    output: "3d",
    description: "Generate 3D models from text prompts",
    requiresInput: false,
    enabled: false, // Coming soon
  },
  // Image-to-X modes
  "image-to-image": {
    id: "image-to-image",
    label: "Image to Image",
    shortLabel: "Transform Image",
    input: "image",
    output: "image",
    description: "Transform images with AI",
    requiresInput: true,
    inputAssetType: "image",
    enabled: true,
  },
  "image-to-video": {
    id: "image-to-video",
    label: "Image to Video",
    shortLabel: "Animate Image",
    input: "image",
    output: "video",
    description: "Animate images into videos",
    requiresInput: true,
    inputAssetType: "image",
    enabled: false, // Coming soon
  },
  "image-to-3d": {
    id: "image-to-3d",
    label: "Image to 3D",
    shortLabel: "Image to 3D",
    input: "image",
    output: "3d",
    description: "Convert images to 3D models",
    requiresInput: true,
    inputAssetType: "image",
    enabled: false, // Coming soon
  },
  // Video-to-X modes
  "video-to-3d": {
    id: "video-to-3d",
    label: "Video to 3D",
    shortLabel: "Video to 3D",
    input: "video",
    output: "3d",
    description: "Convert videos to 3D models",
    requiresInput: true,
    inputAssetType: "video",
    enabled: false, // Coming soon
  },
  // 3D-to-X modes
  "3d-to-image": {
    id: "3d-to-image",
    label: "3D to Image",
    shortLabel: "Render 3D",
    input: "3d",
    output: "image",
    description: "Render 3D models to images",
    requiresInput: true,
    inputAssetType: "3d",
    enabled: false, // Coming soon
  },
};

// ============================================
// Helper Functions
// ============================================

/**
 * Get the generation type config by ID
 */
export function getGenerationTypeConfig(
  type: GenerationType,
): GenerationTypeConfig {
  return generationTypeConfigs[type];
}

/**
 * Get the generation mode config by ID
 */
export function getGenerationMode(modeId: GenerationModeId): GenerationMode {
  return generationModes[modeId];
}

/**
 * Get all enabled generation types
 */
export function getEnabledGenerationTypes(): GenerationTypeConfig[] {
  // For now, only image is fully enabled
  return Object.values(generationTypeConfigs).filter((config) => {
    const textToMode =
      generationModes[`text-to-${config.id}` as GenerationModeId];
    return textToMode?.enabled ?? false;
  });
}

/**
 * Get all generation modes for a specific output type
 */
export function getModesForOutputType(
  outputType: GenerationType,
): GenerationMode[] {
  return Object.values(generationModes).filter(
    (mode) => mode.output === outputType,
  );
}

/**
 * Get the appropriate generation mode based on output type and whether there's input
 */
export function getGenerationModeForContext(
  outputType: GenerationType,
  hasInputAsset: boolean,
  inputAssetType?: GenerationType,
): GenerationMode | null {
  if (hasInputAsset && inputAssetType) {
    // Look for input-to-output mode
    const modeId = `${inputAssetType}-to-${outputType}` as GenerationModeId;
    const mode = generationModes[modeId];
    if (mode?.enabled) return mode;
  }

  // Fall back to text-to-output mode
  const textModeId = `text-to-${outputType}` as GenerationModeId;
  return generationModes[textModeId] || null;
}

/**
 * Get hex color value for a generation type (uses Tailwind's color palette)
 */
export function getGenerationTypeColor(type: GenerationType): string {
  const colorKey = generationTypeConfigs[type].color;
  return colors[colorKey][500];
}

/**
 * Get Tailwind color classes for a generation type
 * @example getGenerationTypeClasses("image") => { text: "text-orange-600", ... }
 */
export function getGenerationTypeClasses(type: GenerationType) {
  const color = generationTypeConfigs[type].color;
  return {
    text: `text-${color}-600`,
    textDark: `dark:text-${color}-500`,
    bg: `bg-${color}-500/10`,
    bgDark: `dark:bg-${color}-500/15`,
    border: `border-${color}-500/30`,
    shadow: `shadow-${color}-600/50`,
  };
}

/**
 * Get all generation types as an array (for UI iteration)
 */
export function getAllGenerationTypes(): GenerationTypeConfig[] {
  return Object.values(generationTypeConfigs);
}

/**
 * Get generation types available for the tactile button selector
 * (only types that have at least one enabled mode)
 */
export function getSelectableGenerationTypes(): GenerationTypeConfig[] {
  return Object.values(generationTypeConfigs).filter((config) => {
    // Check if there's at least one enabled mode for this output type
    return Object.values(generationModes).some(
      (mode) => mode.output === config.id && mode.enabled,
    );
  });
}
