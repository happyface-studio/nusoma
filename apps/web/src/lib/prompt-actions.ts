// =============================================================================
// Prompt Actions Configuration
// =============================================================================
// Centralized configuration for all prompt actions (styles and templates)
// that can be used in the prompt editor. Each action includes:
// - Visual elements (icon, preview image) for the UI
// - Prompt text to inject
// - Optional LoRA URL for style-specific weights
// - Optional overlay flag for compositing modes
// =============================================================================

import type { LucideIcon } from "lucide-react";
import {
  Wand2,
  Camera,
  Lightbulb,
  Grid3x3,
  Palette,
  Sparkles,
} from "lucide-react";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type PromptActionCategory =
  | "style"
  | "camera"
  | "lighting"
  | "composition"
  | "mood"
  | "effects";

export interface PromptAction {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: PromptActionCategory;
  /** Icon component for the action button in the editor */
  icon: LucideIcon;
  /** Preview image path for the action dialog */
  previewImage?: string;
  /** Optional LoRA weights URL for style transfer */
  loraUrl?: string;
  /** Whether this action uses overlay/compositing mode */
  overlay?: boolean;
}

// -----------------------------------------------------------------------------
// Style Actions (formerly styleModels)
// -----------------------------------------------------------------------------

export const styleActions: PromptAction[] = [
  {
    id: "simpsons",
    name: "Simpsons Style",
    description: "Convert to Simpsons cartoon style",
    prompt: "convert to Simpsons cartoon style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/simpsons.jpg",
  },
  {
    id: "lego",
    name: "Lego Style",
    description: "Convert to LEGO brick style",
    prompt: "convert to lego style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/lego.png",
    loraUrl:
      "https://huggingface.co/Owen777/Kontext-Style-Loras/resolve/main/LEGO_lora_weights.safetensors",
  },
  {
    id: "faceretoucher",
    name: "Face Retoucher",
    description: "Touchup photo, remove blemishes and improve skin",
    prompt: "Touchup photo. Remove blemishes and improve skin.",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/faceretoucher.jpg",
    loraUrl:
      "https://storage.googleapis.com/falserverless/kontext-blog/retouch-v1.safetensors",
  },
  {
    id: "3d",
    name: "3D Game Asset",
    description: "Create 3D game asset with isometric view",
    prompt: "Create 3D game asset, isometric view version",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/3d.jpg",
    loraUrl:
      "https://huggingface.co/fal/3D-Game-Assets-Kontext-Dev-LoRA/resolve/main/MnzfOWwLjl1CL_0qu7F6E_adapter_model_comfy_converted.safetensors",
  },
  {
    id: "pixel",
    name: "Pixel Style",
    description: "Convert to pixel art style",
    prompt: "Turn this image into the Pixel style.",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/pixel.png",
    loraUrl:
      "https://huggingface.co/Owen777/Kontext-Style-Loras/resolve/main/Pixel_lora_weights.safetensors",
  },
  {
    id: "snoopy",
    name: "Snoopy Style",
    description: "Convert to Peanuts/Snoopy cartoon style",
    prompt: "Turn this image into the Snoopy style.",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/snoopy.png",
    loraUrl:
      "https://huggingface.co/Owen777/Kontext-Style-Loras/resolve/main/Snoopy_lora_weights.safetensors",
  },
  {
    id: "jojo",
    name: "JoJo Style",
    description: "Convert to JoJo's Bizarre Adventure style",
    prompt: "Turn this image into the JoJo style.",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/jojo.png",
    loraUrl:
      "https://huggingface.co/Owen777/Kontext-Style-Loras/resolve/main/Jojo_lora_weights.safetensors",
  },
  {
    id: "clay",
    name: "Clay Style",
    description: "Convert to clay/claymation style",
    prompt: "Turn this image into the Clay style.",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/clay.png",
    loraUrl:
      "https://huggingface.co/Owen777/Kontext-Style-Loras/resolve/main/Clay_Toy_lora_weights.safetensors",
  },
  {
    id: "ghibli",
    name: "Ghibli Style",
    description: "Convert to Studio Ghibli animation style",
    prompt: "Turn this image into the Ghibli style.",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/ghibli.png",
    loraUrl:
      "https://huggingface.co/Owen777/Kontext-Style-Loras/resolve/main/Ghibli_lora_weights.safetensors",
  },
  {
    id: "americancartoon",
    name: "American Cartoon Style",
    description: "Convert to American cartoon style",
    prompt: "Turn this image into the American Cartoon style.",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/americancartoon.png",
    loraUrl:
      "https://huggingface.co/Owen777/Kontext-Style-Loras/resolve/main/American_Cartoon_lora_weights.safetensors",
  },
  {
    id: "broccoli",
    name: "Broccoli Hair",
    description: "Change hair to a broccoli haircut",
    prompt: "Change hair to a broccoli haircut",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/broccoli.jpeg",
    loraUrl:
      "https://huggingface.co/fal/Broccoli-Hair-Kontext-Dev-LoRA/resolve/main/broccoli-hair-kontext-dev-lora.safetensors",
  },
  {
    id: "plushie",
    name: "Plushie Style",
    description: "Convert to soft plushie/stuffed toy style",
    prompt: "Convert to plushie style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/plushie.png",
    loraUrl:
      "https://huggingface.co/fal/Plushie-Kontext-Dev-LoRA/resolve/main/plushie-kontext-dev-lora.safetensors",
  },
  {
    id: "wojak",
    name: "Wojak Style",
    description: "Convert to Wojak meme style drawing",
    prompt: "Convert to wojak style drawing",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/wojack.jpg",
    loraUrl:
      "https://huggingface.co/fal/Wojak-Kontext-Dev-LoRA/resolve/main/wojak-kontext-dev-lora.safetensors",
  },
  {
    id: "fluffy",
    name: "Fluffy Style",
    description: "Make objects look fluffy and soft",
    prompt: "make this object fluffy",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/fluffy.jpg",
  },
  {
    id: "glassprism",
    name: "Glass Prism",
    description: "Make subject look like glass with black background",
    prompt:
      "make the character/object look like it was made out of glass, black background",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/glassprism.jpg",
  },
  {
    id: "metallic",
    name: "Metallic Objects",
    description: "Make metallic with 3D perspective",
    prompt: "Make it metallic with a black background and a 3D perspective",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/metallic.png",
    loraUrl:
      "https://huggingface.co/ilkerzgi/metallic-objects-kontext-dev-lora/blob/main/metallic-objects-kontext-dev-lora.safetensors",
  },
  {
    id: "anime",
    name: "Anime Style",
    description: "Convert to anime art style",
    prompt: "convert to anime art style with large eyes and stylized features",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/anime.jpg",
  },
  {
    id: "watercolor",
    name: "Watercolor Style",
    description: "Convert to watercolor painting style",
    prompt: "Convert this image into watercolor art style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/watercolor.jpg",
    loraUrl:
      "https://huggingface.co/fal/Watercolor-Art-Kontext-Dev-LoRA/resolve/main/EAA_1Pfw0sBAvtBbv401y_8a8c4091e9ae45869b469bec4a0d8446_adapter_model_comfy_converted.safetensors",
  },
  {
    id: "pencil_drawing",
    name: "Pencil Drawing Style",
    description: "Convert to pencil sketch style",
    prompt: "Convert this image into pencil_drawing art style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/pencil_drawing.jpg",
    loraUrl:
      "https://huggingface.co/fal/Pencil-Drawing-Kontext-Dev-LoRA/resolve/main/wIvB3erdwsH68WsO1RTbv_adapter_model_comfy_converted.safetensors",
  },
  {
    id: "mosaic",
    name: "Mosaic Art Style",
    description: "Convert to mosaic tile art style",
    prompt: "Convert this image into mosaic art style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/mosaicart.jpg",
    loraUrl:
      "https://huggingface.co/fal/Mosaic-Art-Kontext-Dev-LoRA/resolve/main/g_IGTyyzfC27UT9AVlt-v_adapter_model_comfy_converted.safetensors",
  },
  {
    id: "minimalist",
    name: "Minimalist Art Style",
    description: "Convert to minimalist art style",
    prompt: "Convert this image into minimalist art style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/minimalist.jpg",
    loraUrl:
      "https://huggingface.co/fal/Wojak-Kontext-Dev-LoRA/resolve/main/wojak-kontext-dev-lora.safetensors",
  },
  {
    id: "impressionist",
    name: "Impressionist Art Style",
    description: "Convert to impressionist painting style",
    prompt: "Convert this image into impressionist art style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/impressionist.jpg",
    loraUrl:
      "https://huggingface.co/fal/Impressionist-Art-Kontext-Dev-LoRA/resolve/main/5SX6j2wcLJKgudBqlmver_adapter_model_comfy_converted.safetensors",
  },
  {
    id: "lowpoly",
    name: "Low Poly Art Style",
    description: "Convert to low polygon 3D style",
    prompt: "Convert this image to low poly version",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/lowpoly.jpg",
    loraUrl:
      "https://huggingface.co/gokaygokay/Low-Poly-Kontext-Dev-LoRA/resolve/main/ZKcZdffUM6qyMYiEE8ed0_adapter_model_comfy_converted.safetensors",
  },
  {
    id: "abstract",
    name: "Abstract Art Style",
    description: "Convert to abstract art style",
    prompt: "Convert this image to abstract art style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/abstract.jpg",
    loraUrl:
      "https://huggingface.co/fal/Abstract-Art-Kontext-Dev-LoRA/resolve/main/I_iqVzkUKMbyMntpkSU4J_adapter_model_comfy_converted.safetensors",
  },
  {
    id: "cubist",
    name: "Cubist Art Style",
    description: "Convert to cubist art style",
    prompt: "Convert this image to cubist art style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/cubist.jpg",
    loraUrl:
      "https://huggingface.co/fal/Cubist-Art-Kontext-Dev-LoRA/resolve/main/59yr4hcEqhdxkEgIu7iwY_adapter_model_comfy_converted.safetensors",
  },
  {
    id: "charcoal",
    name: "Charcoal Art Style",
    description: "Convert to charcoal drawing style",
    prompt: "Convert this image into charcoal art style",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/charcoal.jpg",
    loraUrl:
      "https://huggingface.co/fal/Charcoal-Art-Kontext-Dev-LoRA/resolve/main/It2d_UD0qRgotAZjJHXx__adapter_model_comfy_converted.safetensors",
  },
  // Overlay styles
  {
    id: "overlay",
    name: "Overlay",
    description: "Place and composite images together",
    prompt: "Place it",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/overlay.png",
    loraUrl:
      "https://huggingface.co/ilkerzgi/Overlay-Kontext-Dev-LoRA/blob/main/WVVtJFD90b8SsU6EzeGkO_adapter_model_comfy_converted.safetensors",
    overlay: true,
  },
  {
    id: "lightfix",
    name: "Light Fix",
    description: "Fix lighting when fusing images",
    prompt: "Fuse this image into background",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/lightfix.png",
    loraUrl:
      "https://huggingface.co/gokaygokay/Light-Fix-Kontext-Dev-LoRA/blob/main/oRdQNr1St3rF_DNI7miGM_adapter_model_comfy_converted.safetensors",
    overlay: true,
  },
  {
    id: "fuseit",
    name: "Fuse It",
    description: "Seamlessly fuse images into background",
    prompt: "Fuse this image into background",
    category: "style",
    icon: Wand2,
    previewImage: "/images/styles/fuseit.png",
    loraUrl:
      "https://huggingface.co/gokaygokay/Fuse-it-Kontext-Dev-LoRA/blob/main/O93-UdItaNx8JzLYgnf2h_adapter_model_comfy_converted.safetensors",
    overlay: true,
  },
];

// -----------------------------------------------------------------------------
// Template Actions (formerly promptTemplates)
// -----------------------------------------------------------------------------

export const templateActions: PromptAction[] = [
  // Camera Angles
  {
    id: "camera-overhead",
    name: "Overhead Shot",
    description: "Bird's eye view from directly above",
    prompt: "overhead shot, bird's eye view, top-down perspective",
    category: "camera",
    icon: Camera,
  },
  {
    id: "camera-low-angle",
    name: "Low Angle",
    description: "Shot from below looking up",
    prompt: "low angle shot, looking up, dramatic perspective",
    category: "camera",
    icon: Camera,
  },
  {
    id: "camera-dutch",
    name: "Dutch Angle",
    description: "Tilted camera angle",
    prompt: "dutch angle, tilted camera, dynamic composition",
    category: "camera",
    icon: Camera,
  },
  {
    id: "camera-close-up",
    name: "Close-up",
    description: "Tight shot focusing on subject",
    prompt: "close-up shot, detailed view, tight framing",
    category: "camera",
    icon: Camera,
  },
  {
    id: "camera-wide",
    name: "Wide Shot",
    description: "Expansive view showing environment",
    prompt: "wide shot, establishing shot, expansive view",
    category: "camera",
    icon: Camera,
  },

  // Lighting
  {
    id: "lighting-golden-hour",
    name: "Golden Hour",
    description: "Warm, soft lighting during sunset/sunrise",
    prompt:
      "golden hour lighting, warm tones, soft shadows, magical atmosphere",
    category: "lighting",
    icon: Lightbulb,
  },
  {
    id: "lighting-dramatic",
    name: "Dramatic Lighting",
    description: "High contrast with strong shadows",
    prompt: "dramatic lighting, chiaroscuro, strong contrast, deep shadows",
    category: "lighting",
    icon: Lightbulb,
  },
  {
    id: "lighting-neon",
    name: "Neon Lighting",
    description: "Vibrant neon lights",
    prompt:
      "neon lighting, cyberpunk atmosphere, vibrant colors, glowing signs",
    category: "lighting",
    icon: Lightbulb,
  },
  {
    id: "lighting-soft",
    name: "Soft Lighting",
    description: "Gentle, diffused light",
    prompt: "soft lighting, diffused light, gentle shadows, flattering",
    category: "lighting",
    icon: Lightbulb,
  },
  {
    id: "lighting-studio",
    name: "Studio Lighting",
    description: "Professional studio setup",
    prompt: "studio lighting, professional setup, well-lit, clean background",
    category: "lighting",
    icon: Lightbulb,
  },

  // Composition
  {
    id: "composition-rule-thirds",
    name: "Rule of Thirds",
    description: "Balanced composition using grid",
    prompt: "rule of thirds composition, balanced layout, professional framing",
    category: "composition",
    icon: Grid3x3,
  },
  {
    id: "composition-symmetry",
    name: "Symmetrical",
    description: "Perfect symmetry and balance",
    prompt: "symmetrical composition, perfect balance, centered subject",
    category: "composition",
    icon: Grid3x3,
  },
  {
    id: "composition-leading-lines",
    name: "Leading Lines",
    description: "Lines that guide the eye",
    prompt: "leading lines, visual flow, guided composition",
    category: "composition",
    icon: Grid3x3,
  },
  {
    id: "composition-negative-space",
    name: "Negative Space",
    description: "Minimalist with empty space",
    prompt: "negative space, minimalist composition, breathing room",
    category: "composition",
    icon: Grid3x3,
  },

  // Mood
  {
    id: "mood-cinematic",
    name: "Cinematic",
    description: "Movie-like atmosphere",
    prompt: "cinematic mood, film-like quality, epic atmosphere",
    category: "mood",
    icon: Palette,
  },
  {
    id: "mood-dreamy",
    name: "Dreamy",
    description: "Soft, ethereal feeling",
    prompt: "dreamy atmosphere, ethereal, soft focus, magical",
    category: "mood",
    icon: Palette,
  },
  {
    id: "mood-dark",
    name: "Dark & Moody",
    description: "Mysterious and atmospheric",
    prompt: "dark and moody, mysterious atmosphere, shadowy",
    category: "mood",
    icon: Palette,
  },
  {
    id: "mood-vibrant",
    name: "Vibrant",
    description: "Energetic and colorful",
    prompt: "vibrant mood, energetic, bold colors, lively",
    category: "mood",
    icon: Palette,
  },

  // Effects
  {
    id: "effect-bokeh",
    name: "Bokeh",
    description: "Blurred background with depth",
    prompt: "bokeh effect, shallow depth of field, blurred background",
    category: "effects",
    icon: Sparkles,
  },
  {
    id: "effect-motion-blur",
    name: "Motion Blur",
    description: "Sense of movement and speed",
    prompt: "motion blur, dynamic movement, speed effect",
    category: "effects",
    icon: Sparkles,
  },
  {
    id: "effect-film-grain",
    name: "Film Grain",
    description: "Analog film texture",
    prompt: "film grain, analog texture, nostalgic feel",
    category: "effects",
    icon: Sparkles,
  },
  {
    id: "effect-lens-flare",
    name: "Lens Flare",
    description: "Sun or light flare effect",
    prompt: "lens flare, sun rays, light leak",
    category: "effects",
    icon: Sparkles,
  },
];

// -----------------------------------------------------------------------------
// Combined Actions
// -----------------------------------------------------------------------------

/** All prompt actions (styles + templates) */
export const promptActions: PromptAction[] = [
  ...styleActions,
  ...templateActions,
];

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/** Get an action by its ID */
export function getActionById(id: string): PromptAction | undefined {
  return promptActions.find((action) => action.id === id);
}

/** Get a style action by its ID */
export function getStyleById(id: string): PromptAction | undefined {
  return styleActions.find((action) => action.id === id);
}

/** Get a template action by its ID */
export function getTemplateById(id: string): PromptAction | undefined {
  return templateActions.find((action) => action.id === id);
}

/** Get all actions in a specific category */
export function getActionsByCategory(
  category: PromptActionCategory,
): PromptAction[] {
  return promptActions.filter((action) => action.category === category);
}

/** Get the default style (simpsons) */
export function getDefaultStyle(): PromptAction {
  return (
    styleActions.find((action) => action.id === "simpsons") || styleActions[0]
  );
}

/** Get all overlay styles */
export function getOverlayStyles(): PromptAction[] {
  return styleActions.filter((action) => action.overlay === true);
}

/** Get all styles that use LoRA */
export function getLoraStyles(): PromptAction[] {
  return styleActions.filter((action) => action.loraUrl !== undefined);
}

/** Get the icon component for a category */
export function getCategoryIcon(category: PromptActionCategory): LucideIcon {
  switch (category) {
    case "style":
      return Wand2;
    case "camera":
      return Camera;
    case "lighting":
      return Lightbulb;
    case "composition":
      return Grid3x3;
    case "mood":
      return Palette;
    case "effects":
      return Sparkles;
    default:
      return Sparkles;
  }
}

/** Get a human-readable category label */
export function getCategoryLabel(category: PromptActionCategory): string {
  switch (category) {
    case "style":
      return "Styles";
    case "camera":
      return "Camera";
    case "lighting":
      return "Lighting";
    case "composition":
      return "Composition";
    case "mood":
      return "Mood";
    case "effects":
      return "Effects";
    default:
      return category;
  }
}
