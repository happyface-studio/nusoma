# Selecting a fal model

- Text-to-image, general: search "text to image", favor flux-family for quality, cheaper SDXL-class for drafts.
- Editing an existing image: image-to-image / inpaint models; pass the source via `referencedAssetIds` and the model's `image_url(s)` input.
- Video from a still: image-to-video models (e.g. kling, ltx). Generate or reuse a still first, then animate.
- Text-to-video: only when no source image is implied.
- LoRA/style: models whose schema accepts a `loras` array.
- Always `fal__get_model_schema` before `generate` — input keys vary per model.
- Budget: `fal__check_pricing` the finalists; stay within the credits stated in your context.
