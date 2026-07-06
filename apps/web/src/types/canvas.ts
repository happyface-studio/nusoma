import type { ImageSizeType } from "@/types/models";

export interface PlacedImage {
  id: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  isGenerated?: boolean;
  parentGroupId?: string;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  // Generation metadata
  generationPrompt?: string;
  creditsConsumed?: number;
  referencedAssetIds?: string[]; // Lineage tracking
}

export interface PlacedVideo extends Omit<PlacedImage, "isGenerated"> {
  isVideo: true;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  volume: number;
  muted: boolean;
  referencedAssetIds?: string[]; // Lineage tracking
  isLooping?: boolean; // Whether the video should loop when it reaches the end
  isGenerating?: boolean; // Similar to isGenerated for images
  isLoaded?: boolean; // Whether the video has loaded its metadata
}

export interface GenerationSettings {
  prompt: string;
  loraUrl: string;
  styleId?: string;
  imageSize?: ImageSizeType;
  referencedAssetIds?: string[]; // Image or Video IDs referenced via @ syntax
  modelId?: string; // Selected model ID (e.g. for video generation)
}

export interface VideoGenerationSettings {
  prompt: string;
  duration?: number;
  styleId?: string;
  motion?: string; // For image-to-video
  sourceUrl?: string; // For image-to-video or video-to-video
  modelId: string; // Model identifier from video-models.ts
  resolution?: "480p" | "720p" | "1080p"; // Video resolution
  cameraFixed?: boolean; // Whether to fix the camera position
  seed?: number; // Random seed to control video generation
  isVideoToVideo?: boolean; // Indicates if this is a video-to-video transformation
  isVideoExtension?: boolean; // Indicates if this is a video extension (using last frame)
  [key: string]: any; // Allow additional model-specific fields
}

export type GenerationState = "submitting" | "running" | "success";

export interface ActiveGeneration {
  imageUrl?: string; // Optional - undefined for text-to-image, present for image-to-image
  referencedAssetIds?: string[]; // Multiple asset IDs for multi-modal generation (@ references)
  imageSrcs?: string[]; // Image URLs to fetch on server (no CORS issues)
  prompt: string;
  loraUrl?: string;
  imageSize?: ImageSizeType;
  state?: GenerationState; // Track generation state
}

export interface ActiveVideoGeneration {
  videoUrl?: string;
  imageUrl?: string; // For image-to-video
  endImageUrl?: string; // For image-to-video (optional end frame)
  prompt: string;
  duration?: number;
  motion?: string;
  styleId?: string;
  modelId?: string; // Model identifier from video-models.ts
  modelConfig?: any; // Model configuration from video-models.ts
  resolution?: "480p" | "720p" | "1080p"; // Video resolution
  cameraFixed?: boolean; // Whether to fix the camera position
  seed?: number; // Random seed to control video generation
  sourceImageId?: string; // ID of the image used for img2vid
  sourceVideoId?: string; // ID of the video used for vid2vid
  isVideoToVideo?: boolean; // Indicates if this is a video-to-video transformation
  isVideoExtension?: boolean; // Indicates if this is a video extension
  promiseResolve?: (value: string) => void; // For toast.promise success
  promiseReject?: (error: Error) => void; // For toast.promise error
  userId?: string; // For billing
  sessionId?: string; // For billing
  imageSize?: ImageSizeType;
  audioUrl?: string; // For video generation with audio
  startImageUrl?: string; // For video generation with start frame
  [key: string]: any; // Allow additional model-specific fields
}

export interface SelectionBox {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  visible: boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
