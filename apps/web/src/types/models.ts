export const ImageModes = {
  TEXT_TO_IMAGE: "text-to-image",
  IMAGE_TO_IMAGE: "image-to-image",
  TEXT_TO_IMAGE_LORA: "text-to-image-lora",
  IMAGE_TO_IMAGE_LORA: "image-to-image-lora",
} as const;

export type ImageGenerationType = (typeof ImageModes)[keyof typeof ImageModes];

export type ImageSizeType =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9"
  | "auto";

export type SafetyToleranceEnum = "1" | "2" | "3" | "4" | "5";

export type OutputFormatEnum = "jpeg" | "png" | "webp";

export type AccelerationEnum = "none" | "regular" | "high";

export interface LoRAInput {
  path: string;
  scale?: number;
}

export interface ImageModelOption {
  name: string;
  type: "select" | "boolean" | "number" | "text" | "lora";
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  options?: Array<{ value: string | number; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface ImageModelConfig<T = any> {
  id: string;
  name: string;
  endpoint: string;
  type: ImageGenerationType;
  options: Record<keyof T | string, ImageModelOption>;
  defaults: Partial<T>;
}

// -----------------------------------------------------------------------------
// Utility Model Types (Background Removal, Object Isolation, etc.)
// -----------------------------------------------------------------------------

export type UtilityModelType = "background-removal" | "object-isolation";

export interface UtilityModelConfig {
  id: string;
  name: string;
  endpoint: string;
  type: UtilityModelType;
  pricing: {
    costPerUnit: number;
    currency: string;
    unit: string;
  };
}

// -----------------------------------------------------------------------------
// Video Model Types
// -----------------------------------------------------------------------------

export const VideoModes = {
  TEXT_TO_VIDEO: "text-to-video",
  IMAGE_TO_VIDEO: "image-to-video",
  VIDEO_TO_VIDEO: "video-to-video",
  MULTICONDITIONING: "multiconditioning",
  VIDEO_EXTENSION: "video-extension",
} as const;

export type VideoGenerationType = (typeof VideoModes)[keyof typeof VideoModes];

export interface VideoModelOption {
  name: string;
  type: "select" | "boolean" | "number" | "text";
  label: string;
  description?: string;
  required?: boolean;
  default?: any;
  options?: Array<{ value: string | number; label: string }>;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}

export interface ModelConstraints {
  resolutionsByModel?: Record<string, string[]>;
  conditionalOptions?: Array<{
    when: { field: string; value: any };
    then: { field: string; value: any };
  }>;
}

export interface VideoModelPricing {
  costPerVideo: number;
  currency: string;
  unit: string;
}

export interface VideoModelConfig<T = any> {
  id: string;
  name: string;
  endpoint: string;
  category: VideoGenerationType;
  pricing: VideoModelPricing;
  options: Record<keyof T | string, VideoModelOption>;
  defaults: Partial<T>;
  constraints?: ModelConstraints;
  isDefault?: boolean;
  supportsMultipleCategories?: boolean;
}

// -----------------------------------------------------------------------------
// Helper Functions - Common
// -----------------------------------------------------------------------------

export interface CommonSizeOption {
  id: string;
  label: string;
  ratio: string;
  icon?: string;
}
