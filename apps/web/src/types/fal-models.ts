export interface FalModelBaseInput {
  seed?: number;
}

// -----------------------------------------------------------------------------
// Kling Models
// -----------------------------------------------------------------------------

export interface KlingImageToVideoInput extends FalModelBaseInput {
  prompt: string;
  start_image_url: string;
  end_image_url?: string;
  duration: "5" | "10";
  negative_prompt?: string;
  generate_audio?: boolean;
}

export interface KlingTextToVideoInput extends FalModelBaseInput {
  prompt: string;
  duration: "5" | "10";
  aspect_ratio?: string;
  negative_prompt?: string;
}

export interface KlingMotionControlInput extends FalModelBaseInput {
  prompt: string;
  image_url: string;
  video_url: string;
  duration: "5" | "10";
  character_orientation?: string;
  negative_prompt?: string;
}

// -----------------------------------------------------------------------------
// LTX Models
// -----------------------------------------------------------------------------

export interface LtxVideoInput extends FalModelBaseInput {
  image_url: string;
  prompt: string;
  negative_prompt?: string;
  resolution?: string;
  aspect_ratio?: string;
  num_frames?: number;
  frame_rate?: number;
  expand_prompt?: boolean;
  reverse_video?: boolean;
  constant_rate_factor?: number;
  enable_safety_checker?: boolean;
}

export interface LtxVideoExtendInput extends FalModelBaseInput {
  video: {
    video_url: string;
    start_frame_num: number;
    reverse_video?: boolean;
    limit_num_frames?: boolean;
    resample_fps?: boolean;
    strength?: number;
    target_fps?: number;
    max_num_frames?: number;
    conditioning_type?: string;
    preprocess?: boolean;
  };
  prompt: string;
  negative_prompt?: string;
  resolution?: string;
  aspect_ratio?: string;
  num_frames?: number;
  first_pass_num_inference_steps?: number;
  first_pass_skip_final_steps?: number;
  second_pass_num_inference_steps?: number;
  second_pass_skip_initial_steps?: number;
  frame_rate?: number;
  expand_prompt?: boolean;
  reverse_video?: boolean;
  enable_safety_checker?: boolean;
  constant_rate_factor?: number;
}

export interface LtxVideoMulticonditioningInput extends FalModelBaseInput {
  prompt: string;
  negative_prompt?: string;
  resolution?: string;
  aspect_ratio?: string;
  num_frames?: number;
  frame_rate?: number;
  first_pass_num_inference_steps?: number;
  first_pass_skip_final_steps?: number;
  second_pass_num_inference_steps?: number;
  second_pass_skip_initial_steps?: number;
  expand_prompt?: boolean;
  reverse_video?: boolean;
  enable_safety_checker?: boolean;
  constant_rate_factor?: number;
  images?: Array<{
    image_url: string;
    strength: number;
    start_frame_num: number;
    end_frame_num?: number;
  }>;
  videos?: Array<{
    video_url: string;
    conditioning_type?: string;
    preprocess?: boolean;
    start_frame_num: number;
    end_frame_num?: number; // Optional in type definition but used as -1 in implementation
    strength?: number;
    limit_num_frames?: boolean;
    max_num_frames?: number;
    resample_fps?: boolean;
    target_fps?: number;
    reverse_video?: boolean;
  }>;
}

export interface LtxVideoV2VInput extends FalModelBaseInput {
  video_url: string;
  prompt?: string;
  strength?: number;
  audio_url?: string;
  start_image_url?: string;
  end_image_url?: string;
}

// -----------------------------------------------------------------------------
// Utility Models
// -----------------------------------------------------------------------------

export interface BriaBackgroundRemovalInput {
  video_url: string;
  background_color?: string;
}

export interface EvfSam2Input {
  image_url: string;
  prompt: string;
  mask_only?: boolean;
  fill_holes?: boolean;
  expand_mask?: number;
}

// -----------------------------------------------------------------------------
// Union Type for Handler
// -----------------------------------------------------------------------------

export type FalVideoGenerationInput =
  | KlingImageToVideoInput
  | KlingMotionControlInput
  | LtxVideoInput
  | LtxVideoExtendInput
  | LtxVideoMulticonditioningInput
  | LtxVideoV2VInput
  | BriaBackgroundRemovalInput;
