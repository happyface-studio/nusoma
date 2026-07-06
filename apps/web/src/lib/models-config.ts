// =============================================================================
// Models Configuration
// =============================================================================
// Centralized configuration for all AI model endpoints used in generation.
// This file defines the available models for different generation types:
// - Image generation (text-to-image, image-to-image, with/without LoRA)
// - Video generation (text-to-video, image-to-video, video-to-video, etc.)
// =============================================================================

// -----------------------------------------------------------------------------
// Image Model Types
// -----------------------------------------------------------------------------

import type {
  ImageModelConfig,
  ImageGenerationType,
  VideoModelConfig,
  UtilityModelConfig,
  VideoGenerationType,
  CommonSizeOption,
} from "@/types/models";
import { ImageModes, VideoModes } from "@/types/models";
import type {
  KlingTextToVideoInput,
  KlingImageToVideoInput,
  KlingMotionControlInput,
  LtxVideoV2VInput,
  BriaBackgroundRemovalInput,
} from "@/types/fal-models";

export const IMAGE_MODELS: Record<ImageGenerationType, ImageModelConfig> = {
  // ---------------------------------------------------------------------------
  // FLUX.2 [pro] - Text to Image
  // https://fal.ai/models/fal-ai/flux-2-pro/api
  // ---------------------------------------------------------------------------
  [ImageModes.TEXT_TO_IMAGE]: {
    id: "flux-2-pro",
    name: "Flux 2 Pro",
    endpoint: "fal-ai/flux-2-pro",
    type: ImageModes.TEXT_TO_IMAGE,
    options: {
      prompt: {
        name: "prompt",
        type: "text",
        label: "Prompt",
        description: "The prompt to generate an image from",
        required: true,
        placeholder: "Describe what you want to generate...",
      },
      image_size: {
        name: "image_size",
        type: "select",
        label: "Image Size",
        description: "The size of the generated image",
        default: "landscape_4_3",
        options: [
          { value: "square_hd", label: "Square HD (1024x1024)" },
          { value: "square", label: "Square (512x512)" },
          { value: "portrait_4_3", label: "Portrait 4:3" },
          { value: "portrait_16_9", label: "Portrait 16:9" },
          { value: "landscape_4_3", label: "Landscape 4:3" },
          { value: "landscape_16_9", label: "Landscape 16:9" },
        ],
      },
      seed: {
        name: "seed",
        type: "number",
        label: "Seed",
        description: "The seed to use for the generation",
        placeholder: "Random",
      },
      safety_tolerance: {
        name: "safety_tolerance",
        type: "select",
        label: "Safety Tolerance",
        description: "Safety tolerance level; 1 most strict, 5 most permissive",
        default: "2",
        options: [
          { value: "1", label: "1 - Most Strict" },
          { value: "2", label: "2 - Strict" },
          { value: "3", label: "3 - Moderate" },
          { value: "4", label: "4 - Permissive" },
          { value: "5", label: "5 - Most Permissive" },
        ],
      },
      enable_safety_checker: {
        name: "enable_safety_checker",
        type: "boolean",
        label: "Enable Safety Checker",
        description: "Whether to enable the safety checker",
        default: true,
      },
      output_format: {
        name: "output_format",
        type: "select",
        label: "Output Format",
        description: "The format of the output image",
        default: "jpeg",
        options: [
          { value: "jpeg", label: "JPEG" },
          { value: "png", label: "PNG" },
        ],
      },
    },
    defaults: {
      image_size: "landscape_4_3",
      safety_tolerance: "2",
      enable_safety_checker: true,
      output_format: "jpeg",
    },
  },

  // ---------------------------------------------------------------------------
  // FLUX.2 [pro] Edit - Image to Image
  // https://fal.ai/models/fal-ai/flux-2-pro/edit/api
  // ---------------------------------------------------------------------------
  [ImageModes.IMAGE_TO_IMAGE]: {
    id: "flux-2-pro-edit",
    name: "Flux 2 Pro Edit",
    endpoint: "fal-ai/flux-2-pro/edit",
    type: ImageModes.IMAGE_TO_IMAGE,
    options: {
      prompt: {
        name: "prompt",
        type: "text",
        label: "Prompt",
        description: "The prompt to generate an image from",
        required: true,
        placeholder: "Describe the edit you want to make...",
      },
      image_urls: {
        name: "image_urls",
        type: "text",
        label: "Image URLs",
        description: "List of URLs of input images for editing",
        required: true,
      },
      image_size: {
        name: "image_size",
        type: "select",
        label: "Image Size",
        description: "The size of the generated image",
        default: "auto",
        options: [
          { value: "auto", label: "Auto (from input)" },
          { value: "square_hd", label: "Square HD (1024x1024)" },
          { value: "square", label: "Square (512x512)" },
          { value: "portrait_4_3", label: "Portrait 4:3" },
          { value: "portrait_16_9", label: "Portrait 16:9" },
          { value: "landscape_4_3", label: "Landscape 4:3" },
          { value: "landscape_16_9", label: "Landscape 16:9" },
        ],
      },
      seed: {
        name: "seed",
        type: "number",
        label: "Seed",
        description: "The seed to use for the generation",
        placeholder: "Random",
      },
      safety_tolerance: {
        name: "safety_tolerance",
        type: "select",
        label: "Safety Tolerance",
        description: "Safety tolerance level; 1 most strict, 5 most permissive",
        default: "2",
        options: [
          { value: "1", label: "1 - Most Strict" },
          { value: "2", label: "2 - Strict" },
          { value: "3", label: "3 - Moderate" },
          { value: "4", label: "4 - Permissive" },
          { value: "5", label: "5 - Most Permissive" },
        ],
      },
      enable_safety_checker: {
        name: "enable_safety_checker",
        type: "boolean",
        label: "Enable Safety Checker",
        description: "Whether to enable the safety checker",
        default: true,
      },
      output_format: {
        name: "output_format",
        type: "select",
        label: "Output Format",
        description: "The format of the output image",
        default: "jpeg",
        options: [
          { value: "jpeg", label: "JPEG" },
          { value: "png", label: "PNG" },
        ],
      },
    },
    defaults: {
      image_size: "auto",
      safety_tolerance: "2",
      enable_safety_checker: true,
      output_format: "jpeg",
    },
  },

  // ---------------------------------------------------------------------------
  // FLUX.2 [dev] LoRA - Text to Image with LoRA
  // https://fal.ai/models/fal-ai/flux-2/lora/api
  // ---------------------------------------------------------------------------
  [ImageModes.TEXT_TO_IMAGE_LORA]: {
    id: "flux-2-pro-lora",
    name: "Flux 2 with LoRA",
    endpoint: "fal-ai/flux-2/lora",
    type: ImageModes.TEXT_TO_IMAGE_LORA,
    options: {
      prompt: {
        name: "prompt",
        type: "text",
        label: "Prompt",
        description: "The prompt to generate an image from",
        required: true,
        placeholder: "Describe what you want to generate...",
      },
      loras: {
        name: "loras",
        type: "lora",
        label: "LoRA Weights",
        description: "List of LoRA weights to apply (maximum 3)",
      },
      guidance_scale: {
        name: "guidance_scale",
        type: "number",
        label: "Guidance Scale",
        description: "How closely the model adheres to your prompt (0-20)",
        default: 2.5,
        min: 0,
        max: 20,
        step: 0.1,
      },
      num_inference_steps: {
        name: "num_inference_steps",
        type: "number",
        label: "Inference Steps",
        description: "Number of inference steps to perform (4-50)",
        default: 28,
        min: 4,
        max: 50,
        step: 1,
      },
      image_size: {
        name: "image_size",
        type: "select",
        label: "Image Size",
        description: "The size of the generated image (512-2048 pixels)",
        default: "landscape_4_3",
        options: [
          { value: "square_hd", label: "Square HD (1024x1024)" },
          { value: "square", label: "Square (512x512)" },
          { value: "portrait_4_3", label: "Portrait 4:3" },
          { value: "portrait_16_9", label: "Portrait 16:9" },
          { value: "landscape_4_3", label: "Landscape 4:3" },
          { value: "landscape_16_9", label: "Landscape 16:9" },
        ],
      },
      num_images: {
        name: "num_images",
        type: "number",
        label: "Number of Images",
        description: "Number of images to generate (1-4)",
        default: 1,
        min: 1,
        max: 4,
        step: 1,
      },
      seed: {
        name: "seed",
        type: "number",
        label: "Seed",
        description: "Random seed for generation",
        placeholder: "Random",
      },
      acceleration: {
        name: "acceleration",
        type: "select",
        label: "Acceleration",
        description: "Speed optimization level",
        default: "regular",
        options: [
          { value: "none", label: "None" },
          { value: "regular", label: "Regular" },
          { value: "high", label: "High" },
        ],
      },
      enable_prompt_expansion: {
        name: "enable_prompt_expansion",
        type: "boolean",
        label: "Enable Prompt Expansion",
        description: "Expand prompt for better results",
        default: false,
      },
      enable_safety_checker: {
        name: "enable_safety_checker",
        type: "boolean",
        label: "Enable Safety Checker",
        description: "Enable NSFW content filtering",
        default: true,
      },
      output_format: {
        name: "output_format",
        type: "select",
        label: "Output Format",
        description: "Image format",
        default: "png",
        options: [
          { value: "jpeg", label: "JPEG" },
          { value: "png", label: "PNG" },
          { value: "webp", label: "WebP" },
        ],
      },
    },
    defaults: {
      guidance_scale: 2.5,
      num_inference_steps: 28,
      image_size: "landscape_4_3",
      num_images: 1,
      acceleration: "regular",
      enable_prompt_expansion: false,
      enable_safety_checker: true,
      output_format: "png",
    },
  },

  // ---------------------------------------------------------------------------
  // FLUX.2 [dev] LoRA Edit - Image to Image with LoRA
  // https://fal.ai/models/fal-ai/flux-2/lora/edit
  // ---------------------------------------------------------------------------
  [ImageModes.IMAGE_TO_IMAGE_LORA]: {
    id: "flux-2-edit-lora",
    name: "Flux 2 Edit with LoRA",
    endpoint: "fal-ai/flux-2/lora/edit",
    type: ImageModes.IMAGE_TO_IMAGE_LORA,
    options: {
      prompt: {
        name: "prompt",
        type: "text",
        label: "Prompt",
        description: "The prompt to generate an image from",
        required: true,
        placeholder: "Describe the edit you want to make...",
      },
      image_urls: {
        name: "image_urls",
        type: "text",
        label: "Image URLs",
        description: "The URLs of the images for editing (max 3)",
        required: true,
      },
      loras: {
        name: "loras",
        type: "lora",
        label: "LoRA Weights",
        description: "List of LoRA weights to apply (maximum 3)",
      },
      guidance_scale: {
        name: "guidance_scale",
        type: "number",
        label: "Guidance Scale",
        description: "How closely the model adheres to your prompt (0-20)",
        default: 2.5,
        min: 0,
        max: 20,
        step: 0.1,
      },
      num_inference_steps: {
        name: "num_inference_steps",
        type: "number",
        label: "Inference Steps",
        description: "Number of inference steps to perform (4-50)",
        default: 28,
        min: 4,
        max: 50,
        step: 1,
      },
      image_size: {
        name: "image_size",
        type: "select",
        label: "Image Size",
        description: "The size of the generated image (512-2048 pixels)",
        default: "landscape_4_3",
        options: [
          { value: "square_hd", label: "Square HD (1024x1024)" },
          { value: "square", label: "Square (512x512)" },
          { value: "portrait_4_3", label: "Portrait 4:3" },
          { value: "portrait_16_9", label: "Portrait 16:9" },
          { value: "landscape_4_3", label: "Landscape 4:3" },
          { value: "landscape_16_9", label: "Landscape 16:9" },
        ],
      },
      num_images: {
        name: "num_images",
        type: "number",
        label: "Number of Images",
        description: "Number of images to generate (1-4)",
        default: 1,
        min: 1,
        max: 4,
        step: 1,
      },
      seed: {
        name: "seed",
        type: "number",
        label: "Seed",
        description: "Random seed for generation",
        placeholder: "Random",
      },
      acceleration: {
        name: "acceleration",
        type: "select",
        label: "Acceleration",
        description: "Speed optimization level",
        default: "regular",
        options: [
          { value: "none", label: "None" },
          { value: "regular", label: "Regular" },
          { value: "high", label: "High" },
        ],
      },
      enable_prompt_expansion: {
        name: "enable_prompt_expansion",
        type: "boolean",
        label: "Enable Prompt Expansion",
        description: "Expand prompt for enhanced results",
        default: false,
      },
      enable_safety_checker: {
        name: "enable_safety_checker",
        type: "boolean",
        label: "Enable Safety Checker",
        description: "Activate safety filtering",
        default: true,
      },
      output_format: {
        name: "output_format",
        type: "select",
        label: "Output Format",
        description: "Image format",
        default: "png",
        options: [
          { value: "jpeg", label: "JPEG" },
          { value: "png", label: "PNG" },
          { value: "webp", label: "WebP" },
        ],
      },
    },
    defaults: {
      guidance_scale: 2.5,
      num_inference_steps: 28,
      image_size: "landscape_4_3",
      num_images: 1,
      acceleration: "regular",
      enable_prompt_expansion: false,
      enable_safety_checker: true,
      output_format: "png",
    },
  },
};

// -----------------------------------------------------------------------------
// Utility Model Types (Background Removal, Object Isolation, etc.)
// -----------------------------------------------------------------------------

export const UTILITY_MODELS: Record<string, UtilityModelConfig> = {
  backgroundRemoval: {
    id: "bria-background-remove",
    name: "Bria Background Removal",
    endpoint: "fal-ai/bria/background/remove",
    type: "background-removal",
    pricing: {
      costPerUnit: 0.01,
      currency: "USD",
      unit: "image",
    },
  },
  objectIsolation: {
    id: "evf-sam-object-isolation",
    name: "EVF-SAM Object Isolation",
    endpoint: "fal-ai/evf-sam",
    type: "object-isolation",
    pricing: {
      costPerUnit: 0.02,
      currency: "USD",
      unit: "image",
    },
  },
};

export function getUtilityModelById(
  id: string,
): UtilityModelConfig | undefined {
  return UTILITY_MODELS[id];
}

// -----------------------------------------------------------------------------
// Video Model Types
// -----------------------------------------------------------------------------

export const VIDEO_MODELS: Record<string, VideoModelConfig> = {
  // ---------------------------------------------------------------------------
  // Kling 2.6 Pro - Text to Video
  // https://fal.ai/models/fal-ai/kling-video/v2.6/pro/text-to-video/api
  // ---------------------------------------------------------------------------
  "kling-video-v2.6-pro-text-to-video": {
    id: "kling-video-v2.6-pro-text-to-video",
    name: "Kling 2.6 Pro (Text to Video)",
    endpoint: "fal-ai/kling-video/v2.6/pro/text-to-video",
    category: VideoModes.TEXT_TO_VIDEO,
    pricing: {
      costPerVideo: 0.15,
      currency: "USD",
      unit: "video",
    },
    isDefault: true,
    options: {
      prompt: {
        name: "prompt",
        type: "text",
        label: "Prompt",
        description: "Text description of the video to generate",
        required: true,
        placeholder: "Describe the video...",
      },
      negative_prompt: {
        name: "negative_prompt",
        type: "text",
        label: "Negative Prompt",
        description: "What to avoid in the generation",
        default: "blur, distort, and low quality",
      },
      duration: {
        name: "duration",
        type: "select",
        label: "Duration",
        description: "Video duration in seconds",
        default: "5",
        options: [
          { value: "5", label: "5 seconds" },
          { value: "10", label: "10 seconds" },
        ],
      },
      aspect_ratio: {
        name: "aspect_ratio",
        type: "select",
        label: "Aspect Ratio",
        description: "The aspect ratio of the video",
        default: "16:9",
        options: [
          { value: "16:9", label: "16:9 Landscape" },
          { value: "9:16", label: "9:16 Portrait" },
          { value: "1:1", label: "1:1 Square" },
        ],
      },
      // Note: cfg_scale and generate_audio might not be in the strict KlingTextToVideoInput yet,
      // handled via loose typing or needs update to type definition if critical.
      // For now we keep them in options for UI even if strict type doesn't enforce them yet.
      cfg_scale: {
        name: "cfg_scale",
        type: "number",
        label: "CFG Scale",
        description: "Guidance scale (0.1 - 1.0)",
        default: 0.5,
        min: 0.1,
        max: 1.0,
        step: 0.1,
      },
      generate_audio: {
        name: "generate_audio",
        type: "boolean",
        label: "Generate Audio",
        description: "Whether to generate matching audio",
        default: true,
      },
    },
    defaults: {
      duration: "5",
      aspect_ratio: "16:9",
      negative_prompt: "blur, distort, and low quality",
      // cfg_scale: 0.5, // Commented out to align with strict types if needed, or cast
      // generate_audio: true,
    },
  } as VideoModelConfig<KlingTextToVideoInput>,

  // ---------------------------------------------------------------------------
  // Kling 2.6 Pro - Image to Video
  // https://fal.ai/models/fal-ai/kling-video/v2.6/pro/image-to-video/api
  // ---------------------------------------------------------------------------
  "kling-video-v2.6-pro-image-to-video": {
    id: "kling-video-v2.6-pro-image-to-video",
    name: "Kling 2.6 Pro (Image to Video)",
    endpoint: "fal-ai/kling-video/v2.6/pro/image-to-video",
    category: VideoModes.IMAGE_TO_VIDEO,
    pricing: {
      costPerVideo: 0.15, // Approximate
      currency: "USD",
      unit: "video",
    },
    isDefault: true,
    options: {
      prompt: {
        name: "prompt",
        type: "text",
        label: "Prompt",
        description: "Text description of the video movement",
        required: true,
      },
      start_image_url: {
        name: "start_image_url",
        type: "text",
        label: "Start Image",
        description: "The starting image for the video",
        required: true,
      },
      end_image_url: {
        name: "end_image_url",
        type: "text",
        label: "End Image (Optional)",
        description: "The ending image for the video",
      },
      duration: {
        name: "duration",
        type: "select",
        label: "Duration",
        description: "Video duration in seconds",
        default: "5",
        options: [
          { value: "5", label: "5 seconds" },
          { value: "10", label: "10 seconds" },
        ],
      },
      negative_prompt: {
        name: "negative_prompt",
        type: "text",
        label: "Negative Prompt",
        description: "What to avoid in the generation",
        default: "blur, distort, and low quality",
      },
      generate_audio: {
        name: "generate_audio",
        type: "boolean",
        label: "Generate Audio",
        description: "Whether to generate matching audio",
        default: true,
      },
    },
    defaults: {
      duration: "5",
      negative_prompt: "blur, distort, and low quality",
      // generate_audio: true,
    },
  } as VideoModelConfig<KlingImageToVideoInput>,

  // ---------------------------------------------------------------------------
  // Kling 2.6 Pro - Motion Control (Image + Video)
  // https://fal.ai/models/fal-ai/kling-video/v2.6/pro/motion-control/api
  // ---------------------------------------------------------------------------
  "kling-video-v2.6-pro-motion-control": {
    id: "kling-video-v2.6-pro-motion-control",
    name: "Kling 2.6 Pro (Motion Control)",
    endpoint: "fal-ai/kling-video/v2.6/pro/motion-control",
    category: VideoModes.IMAGE_TO_VIDEO, // Categorized as image-to-video but uses video ref too
    pricing: {
      costPerVideo: 0.2, // Approximate
      currency: "USD",
      unit: "video",
    },
    isDefault: false,
    options: {
      prompt: {
        name: "prompt",
        type: "text",
        label: "Prompt",
        description: "Description of the character and action",
        required: true,
      },
      image_url: {
        name: "image_url",
        type: "text",
        label: "Character Image",
        description: "Reference image for the character",
        required: true,
      },
      video_url: {
        name: "video_url",
        type: "text",
        label: "Motion Video",
        description: "Reference video for the motion",
        required: true,
      },
      character_orientation: {
        name: "character_orientation",
        type: "select",
        label: "Character Orientation",
        description: "Match orientation of image or video",
        default: "video",
        options: [
          { value: "image", label: "Match Image (Max 10s)" },
          { value: "video", label: "Match Video (Max 30s)" },
        ],
      },
      keep_original_sound: {
        name: "keep_original_sound",
        type: "boolean",
        label: "Keep Original Sound",
        description: "Keep sound from the reference video",
        default: true,
      },
    },
    defaults: {
      character_orientation: "video",
      // keep_original_sound: true,
    },
  } as VideoModelConfig<KlingMotionControlInput>,

  // ---------------------------------------------------------------------------
  // LTX Video 2.1 19b - Video to Video
  // https://fal.ai/models/fal-ai/ltx-2-19b/distilled/video-to-video/api
  // ---------------------------------------------------------------------------
  "ltx-video-2-19b-v2v": {
    id: "ltx-video-2-19b-v2v",
    name: "LTX Video 2.1 (Video to Video)",
    endpoint: "fal-ai/ltx-2-19b/distilled/video-to-video",
    category: VideoModes.VIDEO_TO_VIDEO,
    pricing: {
      costPerVideo: 0.1, // Approximate
      currency: "USD",
      unit: "video",
    },
    isDefault: true,
    options: {
      prompt: {
        name: "prompt",
        type: "text",
        label: "Prompt",
        description: "Description of the video to generate",
        required: true,
      },
      video_url: {
        name: "video_url",
        type: "text",
        label: "Input Video",
        description: "URL of the input video",
        required: true,
      },
      audio_url: {
        name: "audio_url",
        type: "text",
        label: "Audio URL",
        description: "Optional audio track URL",
      },
      start_image_url: {
        name: "start_image_url",
        type: "text",
        label: "Start Image",
        description: "Optional start frame image",
      },
      end_image_url: {
        name: "end_image_url",
        type: "text",
        label: "End Image",
        description: "Optional end frame image",
      },
      strength: {
        name: "strength",
        type: "number",
        label: "Denoising Strength",
        description: "How much to change the input video (0.0-1.0)",
        default: 0.8,
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
      seed: {
        name: "seed",
        type: "number",
        label: "Seed",
        description: "Random seed for generation",
        placeholder: "Random",
      },
    },
    defaults: {
      strength: 0.8,
    },
  } as VideoModelConfig<LtxVideoV2VInput>,

  // ---------------------------------------------------------------------------
  // LTX Video 2.1 19b - Video to Video with LoRA
  // https://fal.ai/models/fal-ai/ltx-2-19b/distilled/video-to-video/lora
  // ---------------------------------------------------------------------------
  "ltx-video-2-19b-v2v-lora": {
    id: "ltx-video-2-19b-v2v-lora",
    name: "LTX Video 2.1 with LoRA (Video to Video)",
    endpoint: "fal-ai/ltx-2-19b/distilled/video-to-video/lora",
    category: VideoModes.VIDEO_TO_VIDEO,
    pricing: {
      costPerVideo: 0.12, // Approximate
      currency: "USD",
      unit: "video",
    },
    isDefault: false,
    options: {
      prompt: {
        name: "prompt",
        type: "text",
        label: "Prompt",
        description: "Description of the video to generate",
        required: true,
      },
      video_url: {
        name: "video_url",
        type: "text",
        label: "Input Video",
        description: "URL of the input video",
        required: true,
      },
      // Inherits most options from base model, plus LoRA
      loras: {
        name: "loras",
        type: "text", // Complex type handled manually for now
        label: "LoRAs",
        description: "LoRA configurations",
      },
      strength: {
        name: "strength",
        type: "number",
        label: "Denoising Strength",
        description: "How much to change the input video",
        default: 0.8,
        min: 0.0,
        max: 1.0,
        step: 0.05,
      },
    },
    defaults: {
      strength: 0.8,
    },
  } as VideoModelConfig<LtxVideoV2VInput>, // Using same V2V input type for now

  // ---------------------------------------------------------------------------
  // Utility: Background Removal
  // ---------------------------------------------------------------------------
  "bria-video-background-removal": {
    id: "bria-video-background-removal",
    name: "Bria Video Background Removal",
    endpoint: "bria/video/background-removal",
    category: "video-to-video",
    pricing: {
      costPerVideo: 0.14,
      currency: "USD",
      unit: "second",
    },
    options: {
      background_color: {
        name: "background_color",
        type: "select",
        label: "Background Color",
        description: "The color to replace the removed background with",
        default: "Black",
        options: [
          { value: "Transparent", label: "Transparent" },
          { value: "Black", label: "Black" },
          { value: "White", label: "White" },
          { value: "Gray", label: "Gray" },
          { value: "Red", label: "Red" },
          { value: "Green", label: "Green" },
          { value: "Blue", label: "Blue" },
          { value: "Yellow", label: "Yellow" },
          { value: "Cyan", label: "Cyan" },
          { value: "Magenta", label: "Magenta" },
          { value: "Orange", label: "Orange" },
        ],
      },
    },
    defaults: {
      background_color: "Black",
    },
  } as VideoModelConfig<BriaBackgroundRemovalInput>,
};

// -----------------------------------------------------------------------------
// Helper Functions - Image Models
// -----------------------------------------------------------------------------

export function getImageModelById(id: string): ImageModelConfig | undefined {
  return Object.values(IMAGE_MODELS).find((model) => model.id === id);
}

export function getImageModelsByType(
  type: ImageGenerationType,
): ImageModelConfig[] {
  // Since we use strict categories now, we can typically return just the single match.
  // But if there were multiple, filtering is safe.
  // Since IMAGE_MODELS is keyed by type (1:1), we can return the exact one.
  const model = IMAGE_MODELS[type];
  return model ? [model] : [];
}

/**
 * Get the appropriate image model based on context.
 * @param hasImageSelected - Whether an input image is selected
 * @param hasLora - Whether the prompt action includes a LoRA URL
 * @returns The appropriate ImageModelConfig for the context
 */
export function getImageModelForContext(
  hasImageSelected: boolean,
  hasLora: boolean,
): ImageModelConfig {
  if (hasImageSelected) {
    // Image-to-image modes
    return hasLora
      ? IMAGE_MODELS[ImageModes.IMAGE_TO_IMAGE_LORA]
      : IMAGE_MODELS[ImageModes.IMAGE_TO_IMAGE];
  } else {
    // Text-to-image modes
    return hasLora
      ? IMAGE_MODELS[ImageModes.TEXT_TO_IMAGE_LORA]
      : IMAGE_MODELS[ImageModes.TEXT_TO_IMAGE];
  }
}

/**
 * Determine the generation type based on context.
 * @param hasImageSelected - Whether an input image is selected
 * @param hasLora - Whether the prompt action includes a LoRA URL
 * @returns The ImageGenerationType for the context
 */
export function getImageGenerationType(
  hasImageSelected: boolean,
  hasLora: boolean,
): ImageGenerationType {
  if (hasImageSelected) {
    return hasLora ? ImageModes.IMAGE_TO_IMAGE_LORA : ImageModes.IMAGE_TO_IMAGE;
  } else {
    return hasLora ? ImageModes.TEXT_TO_IMAGE_LORA : ImageModes.TEXT_TO_IMAGE;
  }
}

/**
 * Build the input parameters for an image generation API call.
 * Uses the model's defaults and overrides with provided options.
 * @param model - The image model configuration
 * @param options - Override options (prompt, imageUrl, imageUrls, loraUrl, seed, imageSize)
 * @returns The formatted input object for the FAL API
 */
export function buildImageModelInput(
  model: ImageModelConfig,
  options: {
    prompt: string;
    imageUrl?: string;
    imageUrls?: string[]; // Multiple images for @ references
    loraUrl?: string;
    seed?: number;
    imageSize?: string;
  },
): Record<string, any> {
  const input: Record<string, any> = {
    prompt: options.prompt,
  };

  // Apply model defaults
  for (const [key, value] of Object.entries(model.defaults)) {
    input[key] = value;
  }

  // Override with provided options
  if (options.seed !== undefined) {
    input.seed = options.seed;
  }

  if (options.imageSize) {
    input.image_size = options.imageSize;
  }

  // Handle image-to-image models (flux-2-pro-edit, flux-2-edit-lora)
  if (
    model.type === ImageModes.IMAGE_TO_IMAGE ||
    model.type === ImageModes.IMAGE_TO_IMAGE_LORA
  ) {
    console.log("Building input for image-to-image:", {
      type: model.type,
      imageUrl: options.imageUrl,
      imageUrls: options.imageUrls,
    });
    // Prefer imageUrls array, fall back to single imageUrl
    if (options.imageUrls && options.imageUrls.length > 0) {
      input.image_urls = options.imageUrls.slice(0, 3); // Max 3 per fal.ai
    } else if (options.imageUrl) {
      input.image_urls = [options.imageUrl];
    }
  }

  // Handle LoRA models (flux-2-pro-lora, flux-2-edit-lora)
  if (
    model.type === ImageModes.TEXT_TO_IMAGE_LORA ||
    model.type === ImageModes.IMAGE_TO_IMAGE_LORA
  ) {
    if (options.loraUrl) {
      input.loras = [{ path: options.loraUrl, scale: 1 }];
    }
  }

  return input;
}

// -----------------------------------------------------------------------------
// Helper Functions - Video Models
// -----------------------------------------------------------------------------

export function getVideoModelById(id: string): VideoModelConfig | undefined {
  return VIDEO_MODELS[id];
}

export function getVideoModelsByCategory(
  category: VideoGenerationType,
): VideoModelConfig[] {
  return Object.values(VIDEO_MODELS).filter(
    (model) =>
      model.category === category ||
      (model.supportsMultipleCategories &&
        category !== "text-to-video" &&
        category !== "video-extension"),
  );
}

export function getVideoModelForCategory(
  category: VideoGenerationType,
): VideoModelConfig {
  const models = getVideoModelsByCategory(category);
  // Default to Kling for most things
  const kling = models.find((m) => m.id.includes("kling"));
  if (kling) return kling;

  // LTX for extend/multi
  if (
    category === VideoModes.VIDEO_EXTENSION ||
    category === VideoModes.MULTICONDITIONING
  ) {
    const ltx = models.find((m) => m.id.includes("ltx"));
    if (ltx) return ltx;
  }
  return models[0] || VIDEO_MODELS["kling-video-v2.6-pro-text-to-video"];
}

export function calculateVideoGenerations(
  model: VideoModelConfig,
  budget: number = 1,
): number {
  return Math.floor(budget / model.pricing.costPerVideo);
}

export function formatPricingMessage(model: VideoModelConfig): string {
  const approximateTimes = calculateVideoGenerations(model);
  return `Your request will cost $${model.pricing.costPerVideo.toFixed(2)} per ${
    model.pricing.unit
  }. For $1 you can run this model approximately ${approximateTimes} times.`;
}

export function getDefaultVideoModel(): VideoModelConfig | undefined {
  return Object.values(VIDEO_MODELS).find((model) => model.isDefault);
}

// -----------------------------------------------------------------------------
// Helper Functions - Common
// -----------------------------------------------------------------------------

/**
 * Get the available size options for a given model.
 * Normalizes options from both image and video models into a common format.
 */
export function getModelSizeOptions(modelId?: string): CommonSizeOption[] {
  // Default options if no model is selected or found (fallback to image defaults)
  const defaultImageOptions: CommonSizeOption[] = [
    { id: "landscape_16_9", label: "16:9 Landscape", ratio: "16:9" },
    { id: "landscape_4_3", label: "4:3 Landscape", ratio: "4:3" },
    { id: "square_hd", label: "Square HD", ratio: "1:1" },
    { id: "portrait_4_3", label: "4:3 Portrait", ratio: "3:4" },
    { id: "portrait_16_9", label: "16:9 Portrait", ratio: "9:16" },
  ];

  if (!modelId) return defaultImageOptions;

  // Check if it's a video model
  const videoModel = VIDEO_MODELS[modelId];
  if (videoModel) {
    const aspectRatioOption = videoModel.options.aspect_ratio;
    if (aspectRatioOption && aspectRatioOption.options) {
      return aspectRatioOption.options.map((opt) => {
        // Parse ratio from label or value if possible, or mapping
        let ratio = "16:9"; // default
        if (opt.value === "16:9") ratio = "16:9";
        else if (opt.value === "9:16") ratio = "9:16";
        else if (opt.value === "1:1") ratio = "1:1";

        return {
          id: String(opt.value),
          label: opt.label,
          ratio: ratio,
        };
      });
    }
  }

  // Check if it's an image model
  // Note: we need to find the model by ID because IMAGE_MODELS is now keyed by type
  const imageModel = Object.values(IMAGE_MODELS).find((m) => m.id === modelId);
  if (imageModel) {
    const imageSizeOption = imageModel.options.image_size;
    if (imageSizeOption && imageSizeOption.options) {
      return imageSizeOption.options
        .filter((opt) => opt.value !== "auto") // Filter out auto for manual selection if desired, or handle it
        .map((opt) => {
          let ratio = "1:1";
          if (String(opt.value).includes("16_9")) ratio = "16:9";
          else if (String(opt.value).includes("4_3")) ratio = "4:3";

          // Swap ratio for portraits
          if (String(opt.value).includes("portrait")) {
            const parts = ratio.split(":");
            ratio = `${parts[1]}:${parts[0]}`;
          }

          return {
            id: String(opt.value),
            label: opt.label,
            ratio: ratio,
          };
        });
    }
  }

  return defaultImageOptions;
}
