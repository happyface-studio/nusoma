import type {
  PlacedImage,
  PlacedVideo,
  GenerationSettings,
  ActiveGeneration,
  ActiveVideoGeneration,
  BoundingBox,
} from "@/types/canvas";
import type { FalClient } from "@fal-ai/client";
import { id } from "@instantdb/react";
import { VIDEO_MODELS } from "../models-config";
import {
  findNonOverlappingPosition,
  processAndUploadImage,
  uploadImageDirect,
} from "./generation-helpers";

interface GenerationHandlerDeps {
  images: PlacedImage[];
  videos: PlacedVideo[];
  selectedIds: string[];
  generationSettings: GenerationSettings;
  canvasSize: { width: number; height: number };
  viewport: { x: number; y: number; scale: number };
  falClient: FalClient;
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  setVideos: React.Dispatch<React.SetStateAction<PlacedVideo[]>>;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  setActiveGenerations: React.Dispatch<
    React.SetStateAction<Map<string, ActiveGeneration>>
  >;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  toast: (props: {
    title: string;
    description?: string;
    variant?: "default" | "destructive";
  }) => void;
  generateTextToImage: (params: any) => Promise<any>;
  setActiveVideoGenerations: React.Dispatch<
    React.SetStateAction<Map<string, ActiveVideoGeneration>>
  >;
  userId?: string;
  sessionId?: string;
}

// ------------------------------------------------------------------
// Internal Helpers
// ------------------------------------------------------------------

const getExistingAssets = (
  images: PlacedImage[],
  videos: PlacedVideo[],
): BoundingBox[] => {
  return [
    ...images.map((img) => ({
      x: img.x,
      y: img.y,
      width: img.width,
      height: img.height,
    })),
    ...videos.map((vid) => ({
      x: vid.x,
      y: vid.y,
      width: vid.width,
      height: vid.height,
    })),
  ];
};

const createPlaceholderImage = (
  deps: GenerationHandlerDeps,
  width: number,
  height: number,
  preferredX: number,
  preferredY: number,
  existingAssets: BoundingBox[],
  settings: GenerationSettings,
  generationParams: Partial<ActiveGeneration>,
) => {
  const { setImages, setActiveGenerations, setSelectedIds } = deps;
  const imageId = id();

  const { x, y } = findNonOverlappingPosition(
    preferredX,
    preferredY,
    width,
    height,
    existingAssets,
  );

  setImages((prev) => [
    ...prev,
    {
      id: imageId,
      src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      x,
      y,
      width,
      height,
      rotation: 0,
      isGenerated: true,
      generationPrompt: settings.prompt,
      creditsConsumed: undefined,
    },
  ]);

  setActiveGenerations((prev) =>
    new Map(prev).set(imageId, {
      ...generationParams,
      prompt: settings.prompt,
      loraUrl: settings.loraUrl,
      imageSize: settings.imageSize,
      state: "submitting",
    } as ActiveGeneration),
  );

  setSelectedIds([imageId]);
};

// ------------------------------------------------------------------
// Handlers
// ------------------------------------------------------------------

const handleMultiImageGeneration = (
  deps: GenerationHandlerDeps,
  referencedImages: PlacedImage[],
  existingAssets: BoundingBox[],
) => {
  const { canvasSize, viewport, generationSettings } = deps;

  // Use first referenced image dimensions as base
  const firstImg = referencedImages[0];
  const width = firstImg.width;
  const height = firstImg.height;

  const viewportCenterX = (canvasSize.width / 2 - viewport.x) / viewport.scale;
  const viewportCenterY = (canvasSize.height / 2 - viewport.y) / viewport.scale;
  const preferredX = viewportCenterX - width / 2;
  const preferredY = viewportCenterY - height / 2;

  createPlaceholderImage(
    deps,
    width,
    height,
    preferredX,
    preferredY,
    existingAssets,
    generationSettings,
    {
      imageSrcs: referencedImages.map((img) => img.src),
    },
  );
};

const handleTextToImageGeneration = (
  deps: GenerationHandlerDeps,
  existingAssets: BoundingBox[],
) => {
  const { canvasSize, viewport, generationSettings } = deps;
  const baseSize = 512;
  let width = baseSize;
  let height = baseSize;
  const imageSize = generationSettings.imageSize || "landscape_16_9";

  switch (imageSize) {
    case "landscape_16_9":
      width = baseSize;
      height = Math.round(baseSize * (9 / 16));
      break;
    case "landscape_4_3":
      width = baseSize;
      height = Math.round(baseSize * (3 / 4));
      break;
    case "square_hd":
    case "square":
      width = baseSize;
      height = baseSize;
      break;
    case "portrait_4_3":
      width = Math.round(baseSize * (3 / 4));
      height = baseSize;
      break;
    case "portrait_16_9":
      width = Math.round(baseSize * (9 / 16));
      height = baseSize;
      break;
  }

  const viewportCenterX = (canvasSize.width / 2 - viewport.x) / viewport.scale;
  const viewportCenterY = (canvasSize.height / 2 - viewport.y) / viewport.scale;
  const preferredX = viewportCenterX - width / 2;
  const preferredY = viewportCenterY - height / 2;

  createPlaceholderImage(
    deps,
    width,
    height,
    preferredX,
    preferredY,
    existingAssets,
    generationSettings,
    {
      imageUrl: undefined,
    },
  );
};

const handleSelectedImagesGeneration = async (
  deps: GenerationHandlerDeps,
  selectedImages: PlacedImage[],
  existingAssets: BoundingBox[],
) => {
  const { falClient, toast, setIsGenerating, generationSettings } = deps;

  for (const img of selectedImages) {
    const result = await processAndUploadImage(img, falClient, toast);
    if (!result) continue; // Skip if failed

    // Calculate output size
    const aspectRatio = result.width / result.height;
    const baseSize = 512;
    let width = baseSize;
    let height = baseSize;
    if (aspectRatio > 1) {
      height = Math.round(baseSize / aspectRatio);
    } else {
      width = Math.round(baseSize * aspectRatio);
    }

    const preferredX = img.x + img.width + 20;
    const preferredY = img.y;

    const { x, y } = findNonOverlappingPosition(
      preferredX,
      preferredY,
      width,
      height,
      existingAssets,
    );

    // Add to existing assets so next image doesn't overlap this one
    existingAssets.push({ x, y, width, height });

    createPlaceholderImage(
      deps,
      width,
      height,
      preferredX,
      preferredY,
      existingAssets,
      generationSettings,
      {
        imageUrl: result.url,
        referencedAssetIds: [img.id],
      },
    );
  }

  setIsGenerating(false);
};

// Helper for video generation
const handleVideoGeneration = async ({
  deps,
  referencedAssets,
  selectedImages,
  selectedVideos,
}: {
  deps: GenerationHandlerDeps;
  referencedAssets: (PlacedImage | PlacedVideo)[];
  selectedImages: PlacedImage[];
  selectedVideos: PlacedVideo[];
}) => {
  const {
    generationSettings,
    setActiveVideoGenerations,
    setIsGenerating,
    toast,
    userId,
    sessionId,
  } = deps;

  let modelId = generationSettings.modelId!;
  let modelConfig = VIDEO_MODELS[modelId];

  if (!modelConfig) {
    toast({
      title: "Model not found",
      description: `The video model ID "${modelId}" is not configured.`,
      variant: "destructive",
    });
    setIsGenerating(false);
    return;
  }

  // Auto-switch logic
  if (modelConfig.category === "text-to-video") {
    const hasImageRef = referencedAssets.some((a) => !("isVideo" in a));
    const hasVideoRef = referencedAssets.some((a) => "isVideo" in a);
    const hasSelectedImage = selectedImages.length > 0;
    const hasSelectedVideo = selectedVideos.length > 0;

    const hasImageInput = hasImageRef || hasSelectedImage;
    const hasVideoInput = hasVideoRef || hasSelectedVideo;

    if (hasImageInput && hasVideoInput) {
      const motionModelId = "kling-video-v2.6-pro-motion-control";
      if (VIDEO_MODELS[motionModelId]) {
        console.log(
          `[Auto-Switch] Switching to ${motionModelId} based on Image+Video inputs`,
        );
        modelId = motionModelId;
        modelConfig = VIDEO_MODELS[motionModelId];
      }
    } else if (hasImageInput) {
      const i2vModelId = "kling-video-v2.6-pro-image-to-video";
      if (VIDEO_MODELS[i2vModelId]) {
        console.log(
          `[Auto-Switch] Switching to ${i2vModelId} based on Image input`,
        );
        modelId = i2vModelId;
        modelConfig = VIDEO_MODELS[i2vModelId];
      }
    }
  }

  const prompt = generationSettings.prompt;
  const generationId = id();

  let payload: any = {
    prompt,
    modelId,
    modelConfig,
    referencedAssetIds: referencedAssets.map((a) => a.id),
    imageSize: generationSettings.imageSize || "landscape_16_9",
    state: "submitting",
    userId,
    sessionId,
  };

  if (modelConfig.category === "text-to-video") {
    if (referencedAssets.length > 0) {
      toast({
        title: "Warning",
        description:
          "Text-to-Video model ignores referenced assets. Use Image-to-Video for inputs.",
        variant: "default",
      });
    }

    if (deps.setVideos) {
      const { canvasSize, viewport } = deps;
      const viewportCenterX =
        (canvasSize.width / 2 - viewport.x) / viewport.scale;
      const viewportCenterY =
        (canvasSize.height / 2 - viewport.y) / viewport.scale;
      const width = 512;
      const height = 288;
      const existingAssets = getExistingAssets(deps.images, deps.videos);

      const { x, y } = findNonOverlappingPosition(
        viewportCenterX - width / 2,
        viewportCenterY - height / 2,
        width,
        height,
        existingAssets,
      );

      deps.setVideos((prev) => [
        ...prev,
        {
          id: generationId,
          src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
          x,
          y,
          width,
          height,
          rotation: 0,
          isVideo: true,
          duration: 5,
          currentTime: 0,
          isPlaying: false,
          volume: 1,
          muted: false,
          isLooping: false,
          isGenerated: true,
        },
      ]);
    }
  } else if (modelConfig.category === "image-to-video") {
    const firstImage = referencedAssets.find(
      (a) => !("isVideo" in a),
    ) as PlacedImage;
    const firstVideo = referencedAssets.find((a) => "isVideo" in a) as
      | PlacedVideo
      | undefined;

    if (modelId === "kling-video-v2.6-pro-motion-control") {
      const imageInput = firstImage || selectedImages[0];
      const videoInput = firstVideo || selectedVideos[0];

      if (!imageInput || !videoInput) {
        toast({
          title: "Missing Inputs",
          description:
            "Motion Control requires both an Image and a Video. Please select them or use @ references.",
          variant: "destructive",
        });
        setIsGenerating(false);
        return;
      }
      payload.imageUrl = imageInput.src;
      payload.videoUrl = videoInput.src;
      payload.sourceImageId = imageInput.id;
      payload.sourceVideoId = videoInput.id;
    } else {
      if (!firstImage) {
        if (selectedImages.length > 0) {
          const img = selectedImages[0];
          payload.imageUrl = img.src;
          payload.sourceImageId = img.id;
        } else {
          toast({
            title: "Missing Input",
            description:
              "Image-to-Video requires an image reference (@image) or a selected image.",
            variant: "destructive",
          });
          setIsGenerating(false);
          return;
        }
      } else {
        payload.imageUrl = firstImage.src;
        payload.sourceImageId = firstImage.id;
        const secondImage = referencedAssets.find(
          (a) => !("isVideo" in a) && a.id !== firstImage.id,
        ) as PlacedImage | undefined;
        if (secondImage) {
          payload.endImageUrl = secondImage.src;
        }
      }
    }

    if (deps.setVideos) {
      const { canvasSize, viewport } = deps;
      const refAsset =
        firstVideo ||
        firstImage ||
        (selectedImages.length > 0 ? selectedImages[0] : null);

      const width = 512;
      const height = 288;
      let preferredX =
        (canvasSize.width / 2 - viewport.x) / viewport.scale - width / 2;
      let preferredY =
        (canvasSize.height / 2 - viewport.y) / viewport.scale - height / 2;

      if (refAsset) {
        preferredX = refAsset.x + refAsset.width + 20;
        preferredY = refAsset.y;
      }

      const existingAssets = getExistingAssets(deps.images, deps.videos);
      const { x, y } = findNonOverlappingPosition(
        preferredX,
        preferredY,
        width,
        height,
        existingAssets,
      );

      deps.setVideos((prev) => [
        ...prev,
        {
          id: generationId,
          src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
          x,
          y,
          width,
          height,
          rotation: 0,
          isVideo: true,
          duration: 5,
          currentTime: 0,
          isPlaying: false,
          volume: 1,
          muted: false,
          isLooping: false,
          isGenerated: true,
        },
      ]);
    }
  } else if (modelConfig.category === "video-to-video") {
    // Handle Video-to-Video (e.g. LTX)
    const firstVideo = referencedAssets.find((a) => "isVideo" in a) as
      | PlacedVideo
      | undefined;

    // For V2V, the "imageUrl" param in TRPC is used for the input video URL
    if (firstVideo) {
      payload.imageUrl = firstVideo.src;
      payload.sourceVideoId = firstVideo.id;
    } else if (selectedVideos.length > 0) {
      const vid = selectedVideos[0];
      payload.imageUrl = vid.src;
      payload.sourceVideoId = vid.id;
    } else {
      toast({
        title: "Missing Input",
        description:
          "Video-to-Video requires a video reference (@video) or a selected video.",
        variant: "destructive",
      });
      setIsGenerating(false);
      return;
    }

    if (deps.setVideos) {
      const { canvasSize, viewport } = deps;
      const refAsset =
        firstVideo || (selectedVideos.length > 0 ? selectedVideos[0] : null);

      const width = 512;
      const height = 288;
      let preferredX =
        (canvasSize.width / 2 - viewport.x) / viewport.scale - width / 2;
      let preferredY =
        (canvasSize.height / 2 - viewport.y) / viewport.scale - height / 2;

      if (refAsset) {
        preferredX = refAsset.x + refAsset.width + 20;
        preferredY = refAsset.y;
      }

      const existingAssets = getExistingAssets(deps.images, deps.videos);
      const { x, y } = findNonOverlappingPosition(
        preferredX,
        preferredY,
        width,
        height,
        existingAssets,
      );

      deps.setVideos((prev) => [
        ...prev,
        {
          id: generationId,
          src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
          x,
          y,
          width,
          height,
          rotation: 0,
          isVideo: true,
          duration: 5,
          currentTime: 0,
          isPlaying: false,
          volume: 1,
          muted: false,
          isLooping: false,
          isGenerated: true,
        },
      ]);
    }
  }

  setActiveVideoGenerations((prev) => new Map(prev).set(generationId, payload));
  setIsGenerating(true);
};

// ------------------------------------------------------------------
// Main Entry Point
// ------------------------------------------------------------------

export const handleRun = async (deps: GenerationHandlerDeps) => {
  const {
    images,
    videos,
    selectedIds,
    generationSettings,
    setIsGenerating,
    toast,
  } = deps;

  if (!generationSettings.prompt) {
    toast({
      title: "No Prompt",
      description: "Please enter a prompt to generate an image",
      variant: "destructive",
    });
    return;
  }

  // Pre-fetch assets for overlap detection
  const existingAssets = getExistingAssets(images, videos);
  setIsGenerating(true);

  const selectedImages = images.filter((img) => selectedIds.includes(img.id));

  // Check if there are referenced assets via @ syntax
  const referencedAssetIds = generationSettings.referencedAssetIds || [];
  const referencedAssets = referencedAssetIds
    .map(
      (refId) =>
        images.find((img) => img.id === refId) ||
        videos.find((vid) => vid.id === refId),
    )
    .filter((asset): asset is PlacedImage | PlacedVideo => !!asset);

  // Video Generation Check
  const isVideoModel =
    generationSettings.modelId && VIDEO_MODELS[generationSettings.modelId];

  if (isVideoModel) {
    const selectedVideos = videos.filter((vid) => selectedIds.includes(vid.id));
    await handleVideoGeneration({
      deps,
      referencedAssets,
      selectedImages,
      selectedVideos,
    });
    return;
  }

  const referencedImages = referencedAssets.filter(
    (asset): asset is PlacedImage => !("isVideo" in asset),
  );

  // 1. Multi-Image Generation from References
  if (referencedImages.length > 0) {
    handleMultiImageGeneration(deps, referencedImages, existingAssets);
    return;
  }

  // 2. Text-To-Image Generation (if nothing selected)
  if (selectedImages.length === 0) {
    handleTextToImageGeneration(deps, existingAssets);
    return;
  }

  // 3. Image-To-Image Generation (Selected Images)
  await handleSelectedImagesGeneration(deps, selectedImages, existingAssets);
};

export { uploadImageDirect };
