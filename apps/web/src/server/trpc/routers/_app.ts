import { z } from "zod";
import { publicProcedure, router } from "../init";
import { tracked } from "@trpc/server";
import { createFalClient, FalClient } from "@fal-ai/client";
import sharp from "sharp";
import {
  getVideoModelById,
  VIDEO_MODELS,
  getImageModelForContext,
  buildImageModelInput,
  UTILITY_MODELS,
} from "@/lib/models-config";
import { db as instantAdmin } from "@/lib/instant-admin";
import {
  checkCreditsForGeneration,
  processGenerationCharge,
  getUserCredits,
  BillingUser,
} from "@/server/billing";
import {
  createRateLimiter,
  shouldLimitRequest,
  RateLimiter,
} from "@/lib/ratelimit";
import type {
  FalVideoGenerationInput,
  KlingImageToVideoInput,
  KlingTextToVideoInput,
  KlingMotionControlInput,
  LtxVideoInput,
  LtxVideoExtendInput,
  LtxVideoMulticonditioningInput,
  LtxVideoV2VInput,
  BriaBackgroundRemovalInput,
} from "@/types/fal-models";

const fal = createFalClient({
  credentials: () => process.env.FAL_KEY as string,
});

// Lazy-loaded rate limiters (only created when first generation is requested)
let imageLimiter: RateLimiter | null = null;
let videoLimiter: RateLimiter | null = null;

function getImageLimiter(): RateLimiter {
  if (!imageLimiter) {
    imageLimiter = {
      perMinute: createRateLimiter(50, "60 s"),
      perHour: createRateLimiter(100, "60 m"),
      perDay: createRateLimiter(1000, "24 h"),
    };
  }
  return imageLimiter;
}

function getVideoLimiter(): RateLimiter {
  if (!videoLimiter) {
    videoLimiter = {
      perMinute: createRateLimiter(10, "60 s"),
      perHour: createRateLimiter(100, "60 m"),
      perDay: createRateLimiter(500, "24 h"),
    };
  }
  return videoLimiter;
}

// Helper function to check rate limits or use custom API key
async function getFalClient(
  apiKey: string | undefined,
  ctx: any,
  isVideo: boolean = false,
) {
  if (apiKey) {
    return createFalClient({
      credentials: () => apiKey,
    });
  }

  // Apply rate limiting when using default key (lazy-load limiter)
  const limiter = isVideo ? getVideoLimiter() : getImageLimiter();

  const ip =
    ctx.req?.headers.get?.("x-forwarded-for") ||
    ctx.req?.headers.get?.("x-real-ip") ||
    "unknown";

  const limiterResult = await shouldLimitRequest(
    limiter,
    ip,
    isVideo ? "video" : "image",
  );
  if (limiterResult.shouldLimitRequest) {
    const errorMessage = isVideo
      ? `Video generation rate limit exceeded: 1 video per ${limiterResult.period}. Add your FAL API key to bypass rate limits.`
      : `Rate limit exceeded per ${limiterResult.period}. Add your FAL API key to bypass rate limits.`;
    throw new Error(errorMessage);
  }

  return fal;
}

// Helper function to download image
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

// Helper function to fetch images from URLs and upload to fal storage
// This runs on the server, so no CORS issues with InstantDB/S3 URLs
async function fetchAndUploadImages(
  imageSrcs: string[],
  falClient: FalClient,
): Promise<string[]> {
  const uploadedUrls: string[] = [];

  for (const src of imageSrcs) {
    try {
      // Download the image directly (no CORS issues on server)
      const imageBuffer = await downloadImage(src);

      // Create a Blob from the buffer for fal upload
      const blob = new Blob([imageBuffer as unknown as BlobPart], {
        type: "image/png",
      });

      // Upload to fal storage
      const uploadResult = await falClient.storage.upload(blob);

      if (uploadResult) {
        uploadedUrls.push(uploadResult);
        console.log(`Uploaded image to fal: ${uploadResult}`);
      }
    } catch (error) {
      console.error(`Failed to fetch/upload image from ${src}:`, error);
    }
  }

  return uploadedUrls;
}

export const appRouter = router({
  transformVideo: publicProcedure
    .input(
      z.object({
        videoUrl: z.url(),
        prompt: z.string().optional(),
        styleId: z.string().optional(),
        apiKey: z.string().optional(),
        // Billing context
        userId: z.string().optional(),
        sessionId: z.string().optional(),
      }),
    )
    .subscription(async function* ({ input, signal, ctx }) {
      try {
        const videoModel = VIDEO_MODELS["stable-video-diffusion"];
        const useCustomApiKey = !!input.apiKey;

        // Billing: Check credits before generation
        const billingUser: BillingUser = {
          userId: input.userId,
          sessionId: input.sessionId,
        };

        const billingCheck = await checkCreditsForGeneration(
          billingUser,
          videoModel.endpoint,
          1,
          useCustomApiKey,
        );

        if (!billingCheck.canProceed) {
          yield tracked(`error_billing`, {
            type: "error",
            error: billingCheck.error || "Insufficient credits",
            creditsRequired: billingCheck.costEstimate.totalCredits,
            currentCredits: billingCheck.currentCredits,
          });
          return;
        }

        const falClient = await getFalClient(input.apiKey, ctx, true);

        // Create a unique ID for this transformation
        const transformationId = `vidtrans_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Yield initial progress
        yield tracked(`${transformationId}_start`, {
          type: "progress",
          progress: 0,
          status: "Starting video transformation...",
        });

        // Start streaming from fal.ai
        const stream = await falClient.stream(
          VIDEO_MODELS["stable-video-diffusion"].endpoint,
          {
            input: {
              video_url: input.videoUrl,
              prompt: input.prompt || "",
              style: input.styleId || "",
              num_inference_steps: 25,
              guidance_scale: 7.5,
            },
          },
        );

        let eventIndex = 0;

        // Stream events as they come
        for await (const event of stream) {
          if (signal?.aborted) {
            break;
          }

          const eventId = `${transformationId}_${eventIndex++}`;

          // Calculate progress percentage if available
          const progress =
            event.progress !== undefined
              ? Math.floor(event.progress * 100)
              : eventIndex * 5; // Fallback progress estimation

          yield tracked(eventId, {
            type: "progress",
            progress,
            status: event.status || "Transforming video...",
            data: event,
          });
        }

        // Get the final result
        const result = await stream.done();

        // Handle different response formats
        const videoUrl =
          (result as any).data?.video?.url ||
          (result as any).data?.url ||
          (result as any).video_url;
        if (!videoUrl) {
          yield tracked(`${transformationId}_error`, {
            type: "error",
            error: "No video generated",
          });
          return;
        }

        // Billing: Charge credits after successful generation
        let billingResult;
        if (!useCustomApiKey && billingUser.userId) {
          billingResult = await processGenerationCharge(
            billingUser,
            billingCheck.costEstimate,
            {
              generation_type: "video-transformation",
              model: videoModel.id,
              prompt: (input.prompt || "").substring(0, 100),
            },
          );

          if (!billingResult.success) {
            console.error("Failed to charge credits:", billingResult.error);
          }
        }

        // Send the final video
        yield tracked(`${transformationId}_complete`, {
          type: "complete",
          videoUrl: videoUrl,
          duration: (result as any).duration || 3, // Default to 3 seconds if not provided
          creditsCharged: billingResult?.creditsCharged,
          remainingCredits: billingResult?.newBalance,
        });
      } catch (error) {
        console.error("Error in video transformation:", error);
        yield tracked(`error_${Date.now()}`, {
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "Failed to transform video",
        });
      }
    }),
  generateImageToVideo: publicProcedure
    .input(
      z
        .object({
          imageUrl: z.url(),
          prompt: z.string().optional(),
          duration: z.number().optional().default(5),
          modelId: z.string().optional(),
          resolution: z
            .enum(["480p", "720p", "1080p"])
            .optional()
            .default("720p"),
          cameraFixed: z.boolean().optional().default(false),
          seed: z.number().optional().default(-1),
          apiKey: z.string().optional(),
          // New optional fields for LTX and advanced usage
          audioUrl: z.string().optional(),
          startImageUrl: z.string().optional(),
          endImageUrl: z.string().optional(),
          // Billing context
          userId: z.string().optional(),
          sessionId: z.string().optional(),
        })
        .loose(), // Allow additional fields for different models
    )
    .subscription(async function* ({ input, signal, ctx }) {
      try {
        const modelId = input.modelId || "kling-video-v2.6-pro-image-to-video";
        const model = getVideoModelById(modelId);
        if (!model) {
          throw new Error(`Unknown model ID: ${modelId}`);
        }
        const useCustomApiKey = !!input.apiKey;

        // Billing: Check credits before generation
        const billingUser: BillingUser = {
          userId: input.userId,
          sessionId: input.sessionId,
        };

        const billingCheck = await checkCreditsForGeneration(
          billingUser,
          model.endpoint,
          1,
          useCustomApiKey,
        );

        if (!billingCheck.canProceed) {
          yield tracked(`error_billing`, {
            type: "error",
            error: billingCheck.error || "Insufficient credits",
            creditsRequired: billingCheck.costEstimate.totalCredits,
            currentCredits: billingCheck.currentCredits,
          });
          return;
        }

        const falClient = await getFalClient(input.apiKey, ctx, true);

        // Create a unique ID for this generation
        const generationId = `img2vid_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Yield initial progress
        yield tracked(`${generationId}_start`, {
          type: "progress",
          progress: 0,
          status: "Starting image-to-video conversion...",
        });

        // Use subscribe instead of stream for SeeDANCE model
        // First yield a progress update to show we're starting
        yield tracked(`${generationId}_starting`, {
          type: "progress",
          progress: 10,
          status: "Starting video generation...",
        });

        // Call the SeeDANCE API using subscribe method
        // Convert duration to one of the allowed values: "5" or "10"
        const duration = input.duration <= 5 ? "5" : "10";

        // Ensure prompt is descriptive enough
        const prompt =
          input.prompt || "A smooth animation of the image with natural motion";

        // Model endpoint from earlier check
        const modelEndpoint = model.endpoint;

        // Build input parameters based on model configuration
        let inputParams: FalVideoGenerationInput | any = {};

        if (input.modelId) {
          const model = getVideoModelById(input.modelId);
          if (model) {
            // Map our generic field names to model-specific field names
            if (model.id === "ltx-video-extend") {
              // Use the dedicated extend endpoint format
              let startFrame = (input as any).startFrameNum ?? 32;

              // Ensure startFrame is a multiple of 8
              if (startFrame % 8 !== 0) {
                // Round to nearest multiple of 8
                startFrame = Math.round(startFrame / 8) * 8;
                console.log(
                  `Adjusted start frame from ${(input as any).startFrameNum} to ${startFrame} (must be multiple of 8)`,
                );
              }

              const params: LtxVideoExtendInput = {
                video: {
                  video_url: input.imageUrl, // imageUrl contains the video URL for extension
                  // Use the validated startFrame (already defaulted and rounded)
                  start_frame_num: startFrame,
                  reverse_video:
                    (input as any).reverseVideoConditioning ?? false,
                  limit_num_frames: (input as any).limitNumFrames ?? false,
                  resample_fps: (input as any).resampleFps ?? false,
                  strength: (input as any).strength ?? 1,
                  target_fps: (input as any).targetFps ?? 30,
                  max_num_frames: (input as any).maxNumFrames ?? 121,
                  conditioning_type: (input as any).conditioningType ?? "rgb",
                  preprocess: (input as any).preprocess ?? false,
                },
                prompt: input.prompt || model.defaults.prompt,
                negative_prompt:
                  (input as any).negativePrompt ||
                  model.defaults.negativePrompt,
                resolution: input.resolution || model.defaults.resolution,
                aspect_ratio:
                  (input as any).aspectRatio || model.defaults.aspectRatio,
                num_frames:
                  (input as any).numFrames || model.defaults.numFrames,
                first_pass_num_inference_steps:
                  (input as any).firstPassNumInferenceSteps || 30,
                first_pass_skip_final_steps:
                  (input as any).firstPassSkipFinalSteps || 3,
                second_pass_num_inference_steps:
                  (input as any).secondPassNumInferenceSteps || 30,
                second_pass_skip_initial_steps:
                  (input as any).secondPassSkipInitialSteps || 17,
                frame_rate:
                  (input as any).frameRate || model.defaults.frameRate,
                expand_prompt:
                  (input as any).expandPrompt ?? model.defaults.expandPrompt,
                reverse_video:
                  (input as any).reverseVideo ?? model.defaults.reverseVideo,
                enable_safety_checker:
                  (input as any).enableSafetyChecker ??
                  model.defaults.enableSafetyChecker,
                constant_rate_factor:
                  (input as any).constantRateFactor ||
                  model.defaults.constantRateFactor,
                seed:
                  input.seed !== undefined && input.seed !== -1
                    ? input.seed
                    : undefined,
              };
              inputParams = params;
            } else if (model.id === "ltx-video-multiconditioning") {
              // Handle multiconditioning model with support for video-to-video
              const isVideoToVideo = (input as any).isVideoToVideo;
              const isVideoExtension = (input as any).isVideoExtension;

              const params: LtxVideoMulticonditioningInput = {
                prompt: input.prompt || "",
                negative_prompt:
                  (input as any).negativePrompt ||
                  model.defaults.negativePrompt,
                resolution: input.resolution || model.defaults.resolution,
                aspect_ratio:
                  (input as any).aspectRatio || model.defaults.aspectRatio,
                num_frames:
                  (input as any).numFrames || model.defaults.numFrames,
                frame_rate:
                  (input as any).frameRate || model.defaults.frameRate,
                first_pass_num_inference_steps:
                  (input as any).firstPassNumInferenceSteps ||
                  model.defaults.firstPassNumInferenceSteps,
                first_pass_skip_final_steps:
                  (input as any).firstPassSkipFinalSteps ||
                  model.defaults.firstPassSkipFinalSteps,
                second_pass_num_inference_steps:
                  (input as any).secondPassNumInferenceSteps ||
                  model.defaults.secondPassNumInferenceSteps,
                second_pass_skip_initial_steps:
                  (input as any).secondPassSkipInitialSteps ||
                  model.defaults.secondPassSkipInitialSteps,
                expand_prompt:
                  (input as any).expandPrompt ?? model.defaults.expandPrompt,
                reverse_video:
                  (input as any).reverseVideo ?? model.defaults.reverseVideo,
                enable_safety_checker:
                  (input as any).enableSafetyChecker ??
                  model.defaults.enableSafetyChecker,
                constant_rate_factor:
                  (input as any).constantRateFactor ||
                  model.defaults.constantRateFactor,
                seed:
                  input.seed !== undefined && input.seed !== -1
                    ? input.seed
                    : undefined,
              };

              // Add image or video conditioning based on the type
              if (isVideoToVideo) {
                if (isVideoExtension) {
                  // For video extension, use conditioning that focuses on the end of the video
                  params.videos = [
                    {
                      video_url: input.imageUrl, // imageUrl contains the video URL
                      conditioning_type: "rgb",
                      preprocess: true,
                      start_frame_num: 24, // Use frames from near the end
                      strength: 1,
                      limit_num_frames: true,
                      max_num_frames: 121,
                      resample_fps: true,
                      target_fps: 30,
                      reverse_video: false,
                    },
                  ];
                  // Modify prompt to indicate continuation
                  if (
                    params.prompt &&
                    !params.prompt.toLowerCase().includes("continue") &&
                    !params.prompt.toLowerCase().includes("extend")
                  ) {
                    params.prompt =
                      "Continue this video naturally. " + params.prompt;
                  }
                } else {
                  // Regular video-to-video transformation
                  params.videos = [
                    {
                      video_url: input.imageUrl, // imageUrl contains the video URL
                      // Ensure numeric values are numbers, not undefined/null if types differ
                      start_frame_num: 0,
                      end_frame_num: -1, // Use all frames
                    },
                  ];
                }
              } else {
                params.images = [
                  {
                    image_url: input.imageUrl,
                    strength: 1.0,
                    start_frame_num: 0,
                  },
                ];
              }
              inputParams = params;
            } else if (model.id === "kling-video-v2.6-pro-image-to-video") {
              // Strip @image references from prompt as they are passed as separate fields
              // Replace @image references with descriptive text
              let imageCount = 0;
              const cleanPrompt = (input.prompt || "")
                .replace(/@image\d+/g, () => {
                  imageCount++;
                  if (imageCount === 1) return "the first frame";
                  if (imageCount === 2) return "the last frame";
                  return "a reference frame";
                })
                .replace(/\s+/g, " ")
                .replace(/,\s*,/g, ",")
                .trim();

              const params: KlingImageToVideoInput = {
                prompt: cleanPrompt,
                start_image_url: input.imageUrl,
                duration: (input.duration <= 5 ? "5" : "10") as "5" | "10",
                negative_prompt:
                  (input as any).negativePrompt ||
                  model.defaults.negativePrompt,
              };

              if (input.endImageUrl) {
                params.end_image_url = input.endImageUrl;
                params.generate_audio = false; // Forced by API: Cannot generate audio with end image
              } else {
                params.generate_audio = (input as any).generateAudio ?? true;
              }
              inputParams = params;
            } else if (model.id === "kling-video-v2.6-pro-motion-control") {
              // Motion Control Parameter Mapping
              const params: KlingMotionControlInput = {
                prompt: input.prompt || "",
                image_url: input.imageUrl,
                video_url: (input as any).videoUrl,
                duration: (input.duration <= 5 ? "5" : "10") as "5" | "10",
                character_orientation:
                  (input as any).characterOrientation || "video",
                negative_prompt:
                  (input as any).negativePrompt ||
                  "blur, distort, and low quality",
              };
              if (!params.video_url) {
                throw new Error(
                  "Motion Control requires a video URL (video_url parameter)",
                );
              }
              inputParams = params;
            } else if (
              model.id === "ltx-video-2-19b-v2v" ||
              model.id === "ltx-video-2-19b-v2v-lora"
            ) {
              // LTX Video-to-Video models
              const params: LtxVideoV2VInput = {
                video_url: input.imageUrl, // imageUrl contains video URL in this context
                prompt: input.prompt || "",
                strength:
                  (input as any).strength || model.defaults.strength || 0.8,
                seed:
                  input.seed !== undefined && input.seed !== -1
                    ? input.seed
                    : undefined,
              };

              // Add optional fields if present
              if (input.audioUrl) {
                params.audio_url = input.audioUrl;
              }
              if (input.startImageUrl) {
                params.start_image_url = input.startImageUrl;
              }
              if (input.endImageUrl) {
                params.end_image_url = input.endImageUrl;
              }

              // Handle LoRAs for the LoRA version
              if (model.id === "ltx-video-2-19b-v2v-lora") {
                // TODO: Map LoRAs from input if available
                // inputParams.loras = ...
              }
              inputParams = params;
            } else if (model.id === "ltx-video") {
              const params: LtxVideoInput = {
                image_url: input.imageUrl,
                prompt: input.prompt || "",
                negative_prompt:
                  (input as any).negativePrompt ||
                  model.defaults.negativePrompt,
                resolution: input.resolution || model.defaults.resolution,
                aspect_ratio:
                  (input as any).aspectRatio || model.defaults.aspectRatio,
                num_frames:
                  (input as any).numFrames || model.defaults.numFrames,
                frame_rate:
                  (input as any).frameRate || model.defaults.frameRate,
                expand_prompt:
                  (input as any).expandPrompt ?? model.defaults.expandPrompt,
                reverse_video:
                  (input as any).reverseVideo ?? model.defaults.reverseVideo,
                constant_rate_factor:
                  (input as any).constantRateFactor ||
                  model.defaults.constantRateFactor,
                seed:
                  input.seed !== undefined && input.seed !== -1
                    ? input.seed
                    : undefined,
                enable_safety_checker: true,
              };
              inputParams = params;
            } else if (modelId === "bria-video-background-removal") {
              // Bria video background removal
              const params: BriaBackgroundRemovalInput = {
                video_url: input.imageUrl, // imageUrl contains the video URL
                background_color:
                  (input as any).backgroundColor ||
                  model.defaults.backgroundColor ||
                  "Black",
              };
              inputParams = params;
            }
          }
        }
        console.log(
          `Calling ${modelEndpoint} with parameters:`,
          JSON.stringify(inputParams, null, 2),
        );

        // Yield 'Generating' status before creating the subscription
        yield tracked(`${generationId}_generating`, {
          type: "progress",
          progress: 0,
          status: "Generating video...",
        });

        let result;
        try {
          result = await falClient.subscribe(modelEndpoint, {
            input: inputParams,
            logs: true,
            onQueueUpdate: (update) => {
              if (
                update.status === "IN_QUEUE" ||
                update.status === "IN_PROGRESS"
              ) {
                const percentage =
                  update.logs?.reduce((acc, log) => {
                    const match = log.message.match(/(\d+)%/);
                    return match ? parseInt(match[1]) : acc;
                  }, 0) || 0;

                // Yield progress update
                // Note: We can't directly yield from inside the callback in a simple await.
                // However, the trpc procedure seems to be a generator because of 'yield tracked' usage earlier.
                // Wait, if this is a generator, we can't await a blocking call that doesn't support yielding.
                // WE NEED TO CHANGE STRATEGY: wrapping subscribe in a way that allows yielding or just acknowledge that
                // standard fal-ai/client subscribe is promise-based.
                // Actually, tracked() helps, but we need to emit.
                // If this function is a generator (async function*), we can yield.
                // But we are inside an arrow function here.
                // Correct approach for fal-ai client in a generator:
                // Use `falClient.submit` then poll, OR rely on `onQueueUpdate` but we can't yield from within the callback
                // to the outer generator.
                // LIMITATION: We cannot easily yield from the callback of subscribe.
                // Alternative: Use a queue/event emitter or just poll.
                // BUT, to keep it simple and effective as per existing pattern:
                // The existing pattern uses `yield tracked(...)`.
                // If we can't yield from callback, we might need to use `fal.queue.submit` and `fal.queue.status`.
                // Let's check if we can use a simpler approach or if we should just stick to verifying the fix works first.
                // Re-reading: The goal is to show "Generating...".
                // Even one yield BEFORE subscribe with status="Generating..." would be better than "Submitting..." forever.
              }
            },
          });
        } catch (apiError: any) {
          console.error("FAL API Error Details:", {
            message: apiError.message,
            status: apiError.status,
            statusText: apiError.statusText,
            body: apiError.body,
            response: apiError.response,
            data: apiError.data,
            sentParameters: inputParams,
            endpoint: modelEndpoint,
          });

          if (apiError.body?.detail) {
            console.error("Validation error details:", apiError.body.detail);
          }
          throw apiError;
        }

        // Yield progress update
        yield tracked(`${generationId}_progress`, {
          type: "progress",
          progress: 100,
          status: "Video generation complete",
        });

        // Handle different response formats from different models
        const videoUrl =
          result.data?.video?.url ||
          result.data?.url ||
          (result as any).video?.url ||
          (result as any).url;
        if (!videoUrl) {
          console.error("No video URL found in response:", result);
          yield tracked(`${generationId}_error`, {
            type: "error",
            error: "No video generated",
          });
          return;
        }

        // Extract duration from response or use input value
        const videoDuration = result.data?.duration || input.duration || 5;

        // Billing: Charge credits after successful generation
        let billingResult;
        if (!useCustomApiKey && billingUser.userId) {
          billingResult = await processGenerationCharge(
            billingUser,
            billingCheck.costEstimate,
            {
              generation_type: "image-to-video",
              model: modelId,
              prompt: (input.prompt || "").substring(0, 100),
            },
          );

          if (!billingResult.success) {
            console.error("Failed to charge credits:", billingResult.error);
          }
        }

        // Send the final video
        yield tracked(`${generationId}_complete`, {
          type: "complete",
          videoUrl: videoUrl,
          duration: videoDuration,
          creditsCharged: billingResult?.creditsCharged,
          remainingCredits: billingResult?.newBalance,
        });
      } catch (error) {
        console.error("Error in image-to-video conversion:", error);
        yield tracked(`error_${Date.now()}`, {
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "Failed to convert image to video",
        });
      }
    }),

  generateTextToVideo: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        duration: z.number().optional().default(3),
        aspectRatio: z.string().optional().default("16:9"),
        styleId: z.string().optional(),
        apiKey: z.string().optional(),
        // Billing context
        userId: z.string().optional(),
        sessionId: z.string().optional(),
      }),
    )
    .subscription(async function* ({ input, signal, ctx }) {
      try {
        const videoModel = VIDEO_MODELS["kling-video-v2.6-pro-text-to-video"];
        const useCustomApiKey = !!input.apiKey;

        // Billing: Check credits before generation
        const billingUser: BillingUser = {
          userId: input.userId,
          sessionId: input.sessionId,
        };

        const billingCheck = await checkCreditsForGeneration(
          billingUser,
          videoModel.endpoint,
          1,
          useCustomApiKey,
        );

        if (!billingCheck.canProceed) {
          yield tracked(`error_billing`, {
            type: "error",
            error: billingCheck.error || "Insufficient credits",
            creditsRequired: billingCheck.costEstimate.totalCredits,
            currentCredits: billingCheck.currentCredits,
          });
          return;
        }

        const falClient = await getFalClient(input.apiKey, ctx, true);

        // Create a unique ID for this generation
        const generationId = `vid_${Date.now()}_${Math.random().toString(36).substring(7)}`;

        // Yield initial progress
        yield tracked(`${generationId}_start`, {
          type: "progress",
          progress: 0,
          status: "Starting video generation...",
        });

        // Map duration to Kling's expected string format ("5" or "10")
        const durationStr = input.duration <= 5 ? "5" : "10";

        const result = await falClient.subscribe(videoModel.endpoint, {
          input: {
            prompt: input.prompt,
            duration: durationStr,
            aspect_ratio: input.aspectRatio,
            negative_prompt: "blur, distort, and low quality",
          },
          logs: true,
          onQueueUpdate: (update) => {
            if (
              update.status === "IN_QUEUE" ||
              update.status === "IN_PROGRESS"
            ) {
              // For now, we rely on the final result or implement a more complex progress tracking if needed.
            }
          },
        });

        // Kling returns the video URL in the result
        const videoUrl =
          (result.data as any)?.video?.url ||
          (result.data as any)?.url ||
          (result as any).video_url;

        if (!videoUrl) {
          yield tracked(`${generationId}_error`, {
            type: "error",
            error: "No video generated",
          });
          return;
        }

        // Billing: Charge credits after successful generation
        let billingResult;
        if (!useCustomApiKey && billingUser.userId) {
          billingResult = await processGenerationCharge(
            billingUser,
            billingCheck.costEstimate,
            {
              generation_type: "text-to-video",
              model: videoModel.id,
              prompt: (input.prompt || "").substring(0, 100),
            },
          );
        }

        const videoDuration = durationStr === "5" ? 5 : 10;

        // Send the final video
        yield tracked(`${generationId}_complete`, {
          type: "complete",
          videoUrl: videoUrl,
          duration: videoDuration,
          creditsCharged: billingResult?.creditsCharged,
          remainingCredits: billingResult?.newBalance,
        });
      } catch (error) {
        console.error("Error in video generation:", error);
        yield tracked(`error_${Date.now()}`, {
          type: "error",
          error:
            error instanceof Error ? error.message : "Failed to generate video",
        });
      }
    }),

  // Billing: Charge credits after successful generation
  removeBackground: publicProcedure
    .input(
      z.object({
        imageUrl: z.url(),
        apiKey: z.string().optional(),
        // Billing context
        userId: z.string().optional(),
        sessionId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const utilityModel = UTILITY_MODELS.backgroundRemoval;
        const useCustomApiKey = !!input.apiKey;

        // Billing: Check credits before generation
        const billingUser: BillingUser = {
          userId: input.userId,
          sessionId: input.sessionId,
        };

        const billingCheck = await checkCreditsForGeneration(
          billingUser,
          utilityModel.endpoint,
          1,
          useCustomApiKey,
        );

        if (!billingCheck.canProceed) {
          throw new Error(billingCheck.error || "Insufficient credits");
        }

        const falClient = await getFalClient(input.apiKey, ctx);

        const result = await falClient.subscribe(utilityModel.endpoint, {
          input: {
            image_url: input.imageUrl,
            sync_mode: true,
          },
        });

        // Billing: Charge credits after successful generation
        let billingResult;
        if (!useCustomApiKey && billingUser.userId) {
          billingResult = await processGenerationCharge(
            billingUser,
            billingCheck.costEstimate,
            {
              generation_type: "remove-background",
              model: utilityModel.id,
            },
          );
        }

        return {
          url: result.data.image.url,
          creditsCharged: billingResult?.creditsCharged,
          remainingCredits: billingResult?.newBalance,
        };
      } catch (error) {
        console.error("Error removing background:", error);
        throw new Error(
          error instanceof Error
            ? error.message
            : "Failed to remove background",
        );
      }
    }),

  isolateObject: publicProcedure
    .input(
      z.object({
        imageUrl: z.url(),
        textInput: z.string(),
        apiKey: z.string().optional(),
        // Billing context
        userId: z.string().optional(),
        sessionId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const utilityModel = UTILITY_MODELS.objectIsolation;
        const useCustomApiKey = !!input.apiKey;

        // Billing: Check credits before generation
        const billingUser: BillingUser = {
          userId: input.userId,
          sessionId: input.sessionId,
        };

        const billingCheck = await checkCreditsForGeneration(
          billingUser,
          utilityModel.endpoint,
          1,
          useCustomApiKey,
        );

        if (!billingCheck.canProceed) {
          throw new Error(billingCheck.error || "Insufficient credits");
        }

        const falClient = await getFalClient(input.apiKey, ctx);

        // Use the FAL client with EVF-SAM2 for segmentation
        console.log("Using FAL client for EVF-SAM2...");
        console.log("FAL_KEY present:", !!process.env.FAL_KEY);
        console.log("Input:", {
          imageUrl: input.imageUrl,
          prompt: input.textInput,
        });

        // Use EVF-SAM2 to get the segmentation mask
        const result = await falClient.subscribe(utilityModel.endpoint, {
          input: {
            image_url: input.imageUrl,
            prompt: input.textInput,
            mask_only: true, // Get the binary mask
            fill_holes: true, // Clean up the mask
            expand_mask: 2, // Slightly expand to avoid cutting edges
          },
        });

        console.log("FAL API Success Response:", result.data);

        // Check if we got a valid mask
        if (!result.data?.image?.url) {
          throw new Error("No objects found matching the description");
        }

        // Download both the original image and the mask
        console.log("Downloading original image and mask...");
        const [originalBuffer, maskBuffer] = await Promise.all([
          downloadImage(input.imageUrl),
          downloadImage(result.data.image.url),
        ]);

        // Apply mask to original image
        console.log("Applying mask to extract segmented object...");

        // Load images with sharp
        const originalImage = sharp(originalBuffer);
        const maskImage = sharp(maskBuffer);

        // Get metadata to ensure dimensions match
        const [originalMetadata, maskMetadata] = await Promise.all([
          originalImage.metadata(),
          maskImage.metadata(),
        ]);

        console.log(
          `Original image: ${originalMetadata.width}x${originalMetadata.height}`,
        );
        console.log(`Mask image: ${maskMetadata.width}x${maskMetadata.height}`);

        // Resize mask to match original if needed
        let processedMask = maskImage;
        if (
          originalMetadata.width !== maskMetadata.width ||
          originalMetadata.height !== maskMetadata.height
        ) {
          console.log("Resizing mask to match original image dimensions...");
          processedMask = maskImage.resize(
            originalMetadata.width,
            originalMetadata.height,
          );
        }

        // Apply the mask as an alpha channel
        // First ensure both images have alpha channels
        const [rgbaOriginal, alphaMask] = await Promise.all([
          originalImage
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true }),
          processedMask
            .grayscale() // Convert to single channel
            .raw()
            .toBuffer({ resolveWithObject: true }),
        ]);

        console.log("Original image buffer info:", rgbaOriginal.info);
        console.log("Mask buffer info:", alphaMask.info);

        // Create new image buffer with mask applied as alpha
        const outputBuffer = Buffer.alloc(rgbaOriginal.data.length);

        // Apply mask: copy RGB from original, use mask value as alpha
        for (
          let i = 0;
          i < rgbaOriginal.info.width * rgbaOriginal.info.height;
          i++
        ) {
          const rgbOffset = i * 4;
          const maskOffset = i; // Grayscale mask has 1 channel

          // Copy RGB values
          outputBuffer[rgbOffset] = rgbaOriginal.data[rgbOffset]; // R
          outputBuffer[rgbOffset + 1] = rgbaOriginal.data[rgbOffset + 1]; // G
          outputBuffer[rgbOffset + 2] = rgbaOriginal.data[rgbOffset + 2]; // B

          // Use mask value as alpha (white = opaque, black = transparent)
          outputBuffer[rgbOffset + 3] = alphaMask.data[maskOffset];
        }

        // Create final image from the buffer
        const segmentedImage = await sharp(outputBuffer, {
          raw: {
            width: rgbaOriginal.info.width,
            height: rgbaOriginal.info.height,
            channels: 4,
          },
        })
          .png()
          .toBuffer();

        // Upload the segmented image to FAL storage
        console.log("Uploading segmented image to storage...");
        const uploadResult = await falClient.storage.upload(
          new Blob([new Uint8Array(segmentedImage)], { type: "image/png" }),
        );

        // Return the URL of the segmented object
        console.log("Returning segmented image URL:", uploadResult);
        console.log("Original mask URL:", result.data.image.url);

        // Billing: Charge credits after successful generation
        let billingResult;
        if (!useCustomApiKey && billingUser.userId) {
          billingResult = await processGenerationCharge(
            billingUser,
            billingCheck.costEstimate,
            {
              generation_type: "object-isolation",
              model: utilityModel.id,
              prompt: input.textInput.substring(0, 100),
            },
          );
        }

        return {
          url: uploadResult,
          maskUrl: result.data.image.url, // Also return mask URL for reference
          creditsCharged: billingResult?.creditsCharged,
          remainingCredits: billingResult?.newBalance,
        };
      } catch (error: any) {
        console.error("Error isolating object:", error);
        console.error("Error details:", {
          message: error.message,
          status: error.status,
          body: error.body,
          data: error.data,
        });

        // Check for enterprise-only error (shouldn't happen with EVF-SAM2)
        if (
          error.body?.detail?.includes("not enterprise ready") ||
          error.message?.includes("not enterprise ready")
        ) {
          throw new Error(
            "This model requires an enterprise FAL account. Please contact FAL support for access or use the 'Remove Background' feature instead.",
          );
        }

        // Check for other specific error types
        if (error.status === 403 || error.message?.includes("Forbidden")) {
          throw new Error(
            "API access denied. Please check your FAL API key permissions.",
          );
        }

        throw new Error(error.message || "Failed to isolate object");
      }
    }),

  generateTextToImage: publicProcedure
    .input(
      z.object({
        prompt: z.string(),
        loraUrl: z.url().optional(),
        seed: z.number().optional(),
        imageSize: z
          .enum([
            "landscape_4_3",
            "portrait_4_3",
            "square",
            "square_hd",
            "landscape_16_9",
            "portrait_16_9",
            "auto",
          ])
          .optional(),
        apiKey: z.string().optional(),
        userId: z.string().optional(),
        sessionId: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      try {
        const hasLora = !!input.loraUrl;
        const model = getImageModelForContext(false, hasLora);
        const useCustomApiKey = !!input.apiKey;

        // Billing: Check credits before generation
        const billingUser: BillingUser = {
          userId: input.userId,
          sessionId: input.sessionId,
        };

        const billingCheck = await checkCreditsForGeneration(
          billingUser,
          model.endpoint,
          1,
          useCustomApiKey,
        );

        if (!billingCheck.canProceed) {
          throw new Error(billingCheck.error || "Insufficient credits");
        }

        const falClient = await getFalClient(input.apiKey, ctx);

        // Build input using model config
        const subscribeInput = buildImageModelInput(model, {
          prompt: input.prompt,
          loraUrl: input.loraUrl,
          seed: input.seed,
          imageSize: input.imageSize,
        });

        console.log(`Calling ${model.endpoint} with: `, subscribeInput);

        const result = await falClient.subscribe(model.endpoint, {
          input: subscribeInput,
          logs: true,
        });

        // Handle different possible response structures
        const resultData = (result as any).data || result;
        if (!resultData.images?.[0]) {
          throw new Error("No image generated");
        }

        // Billing: Charge credits after successful generation
        let billingResult;
        if (!useCustomApiKey && billingUser.userId) {
          billingResult = await processGenerationCharge(
            billingUser,
            billingCheck.costEstimate,
            {
              generation_type: "text-to-image",
              model: model.id,
              prompt: input.prompt.substring(0, 100),
            },
          );
        }

        return {
          url: resultData.images[0].url,
          width: resultData.images[0].width,
          height: resultData.images[0].height,
          seed: resultData.seed,
          creditsCharged: billingResult?.creditsCharged,
          remainingCredits: billingResult?.newBalance,
        };
      } catch (error) {
        console.error("Error in text-to-image generation:", error);
        throw new Error(
          error instanceof Error ? error.message : "Failed to generate image",
        );
      }
    }),

  generateImageStream: publicProcedure
    .input(
      z.object({
        imageUrl: z.url().optional(),
        imageUrls: z.array(z.url()).max(3).optional(), // Multiple pre-uploaded fal URLs
        imageSrcs: z.array(z.string()).max(3).optional(), // Image URLs to fetch on server (no CORS)
        prompt: z.string(),
        loraUrl: z.url().optional(),
        seed: z.number().optional(),
        imageSize: z
          .enum([
            "landscape_4_3",
            "portrait_4_3",
            "square",
            "square_hd",
            "landscape_16_9",
            "portrait_16_9",
            "auto",
          ])
          .optional(),
        lastEventId: z.string().optional(),
        apiKey: z.string().optional(),
        // Billing context
        userId: z.string().optional(),
        sessionId: z.string().optional(),
      }),
    )
    .subscription(async function* ({ input, ctx }) {
      try {
        // Check if we have images (single, multiple fal URLs, or URLs to fetch)
        const hasImageSrcs =
          input.imageSrcs !== undefined && input.imageSrcs.length > 0;
        const hasImageUrls =
          input.imageUrls !== undefined && input.imageUrls.length > 0;
        const hasImageSelected =
          !!input.imageUrl || hasImageUrls || hasImageSrcs;
        const hasLora = !!input.loraUrl;
        const model = getImageModelForContext(hasImageSelected, hasLora);
        const useCustomApiKey = !!input.apiKey;

        // Billing: Check credits before generation
        const billingUser: BillingUser = {
          userId: input.userId,
          sessionId: input.sessionId,
        };

        const billingCheck = await checkCreditsForGeneration(
          billingUser,
          model.endpoint,
          1,
          useCustomApiKey,
        );

        if (!billingCheck.canProceed) {
          yield tracked(`error_billing`, {
            type: "error",
            error: billingCheck.error || "Insufficient credits",
            creditsRequired: billingCheck.costEstimate.totalCredits,
            currentCredits: billingCheck.currentCredits,
          });
          return;
        }

        const falClient = await getFalClient(input.apiKey, ctx);

        // Create a unique ID for this generation
        const generationId = `gen_${Date.now()}_${Math.random().toString(36).substring(7)} `;

        // If imageSrcs are provided, fetch on server (no CORS) and upload to fal
        let resolvedImageUrls = input.imageUrls;
        if (hasImageSrcs && input.imageSrcs) {
          console.log(`Fetching ${input.imageSrcs.length} images on server...`);
          resolvedImageUrls = await fetchAndUploadImages(
            input.imageSrcs,
            falClient,
          );
          if (resolvedImageUrls.length === 0) {
            yield tracked(`${generationId} _error`, {
              type: "error",
              error: "Failed to fetch referenced images",
            });
            return;
          }
          console.log(
            `Successfully uploaded ${resolvedImageUrls.length} images to fal`,
          );
        }

        // Build input using model config
        const subscribeInput = buildImageModelInput(model, {
          prompt: input.prompt,
          imageUrl: input.imageUrl,
          imageUrls: resolvedImageUrls, // Use resolved URLs (either from input or fetched)
          loraUrl: input.loraUrl,
          seed: input.seed,
          imageSize: input.imageSize,
        });

        console.log(`Calling ${model.endpoint} with: `, subscribeInput);

        // Yield initial progress
        yield tracked(`${generationId} _start`, {
          type: "progress",
          data: { status: "Starting image generation..." },
        });

        // Use subscribe instead of stream (flux-2-pro doesn't support streaming)
        const result = await falClient.subscribe(model.endpoint, {
          input: subscribeInput,
          logs: true,
          onQueueUpdate: (update) => {
            console.log("Queue update:", update.status);
          },
        });

        // Handle different possible response structures
        const resultData = (result as any).data || result;
        const images = resultData.images || [];
        if (!images?.[0]) {
          yield tracked(`${generationId} _error`, {
            type: "error",
            error: "No image generated",
          });
          return;
        }

        // Billing: Charge credits after successful generation (only if not using custom API key)
        let billingResult;
        if (!useCustomApiKey && billingUser.userId) {
          billingResult = await processGenerationCharge(
            billingUser,
            billingCheck.costEstimate,
            {
              generation_type: "image",
              model: model.id,
              prompt: input.prompt.substring(0, 100), // Truncate for metadata
            },
          );

          if (!billingResult.success) {
            console.error("Failed to charge credits:", billingResult.error);
            // Still return the image since generation succeeded
          }
        }

        // Send the final image
        yield tracked(`${generationId} _complete`, {
          type: "complete",
          imageUrl: images[0].url,
          seed: resultData.seed,
          creditsCharged: billingResult?.creditsCharged,
          remainingCredits: billingResult?.newBalance,
        });
      } catch (error: any) {
        console.error("Error in image generation stream:", error);

        // Log detailed error info from Fal API
        if (error.body || error.status) {
          console.error("Fal API Error Details:", {
            status: error.status,
            body: error.body,
            message: error.message,
          });
        }

        yield tracked(`error_${Date.now()} `, {
          type: "error",
          error:
            error instanceof Error ? error.message : "Failed to generate image",
        });
      }
    }),

  // ============================================================================
  // Billing Procedures
  // ============================================================================

  /**
   * Get user's current credit balance from Polar
   */
  getUserCredits: publicProcedure
    .input(
      z.object({
        userId: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const credits = await getUserCredits({ userId: input.userId });
      return { credits };
    }),

  /**
   * Get available credit packages from Polar
   */
  getCreditPackages: publicProcedure.query(async () => {
    const { api } = await import("@/lib/polar");

    try {
      const products = await api.products.list({
        isArchived: false,
      });

      // Filter and map products to credit packages format
      const packages = products.result.items
        .filter((product) => !product.isRecurring)
        .map((product) => {
          // Get price info (type-safe)
          const price = product.prices[0];
          const priceAmount =
            price?.amountType === "fixed" ? price.priceAmount : 0;
          const priceCurrency =
            price?.amountType === "fixed" ? price.priceCurrency : "usd";

          // Find meter_credit benefit to get credits amount
          const creditBenefit = product.benefits.find(
            (b) => b.type === "meter_credit",
          );
          const credits =
            creditBenefit?.type === "meter_credit"
              ? creditBenefit.properties.units
              : 0;

          return {
            id: product.id,
            name: product.name,
            description: product.description,
            priceAmount,
            priceCurrency,
            credits,
          };
        })
        .filter((pkg) => pkg.credits > 0);

      return packages;
    } catch (error) {
      console.error("Failed to fetch credit packages from Polar:", error);
      throw new Error("Failed to load credit packages");
    }
  }),

  /**
   * Create a checkout session for purchasing credits
   */
  createCheckoutSession: publicProcedure
    .input(
      z.object({
        productId: z.string(),
        userId: z.string(),
        userEmail: z.string().email().optional(),
        successUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { api } = await import("@/lib/polar");

      try {
        const checkout = await api.checkouts.create({
          products: [input.productId],
          customerEmail: input.userEmail,
          externalCustomerId: input.userId, // Set external ID directly so we can look up the customer later
          successUrl:
            input.successUrl ||
            `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success`,
          embedOrigin: process.env.NEXT_PUBLIC_APP_URL,
        });

        return {
          checkoutId: checkout.id,
          checkoutUrl: checkout.url,
          clientSecret: checkout.clientSecret,
        };
      } catch (error) {
        console.error("Failed to create checkout session:", error);
        throw new Error("Failed to create checkout session");
      }
    }),
});

export type AppRouter = typeof appRouter;
