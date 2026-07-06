import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Generate one media asset on the user's canvas by running a fal model. This is the only way to produce output. Pass the runId from your context.",
  inputSchema: z.object({
    runId: z
      .string()
      .describe("The runId given in your context. Do not invent one."),
    endpoint: z.string().describe('fal endpoint, e.g. "fal-ai/flux-2-pro"'),
    input: z
      .record(z.string(), z.any())
      .describe("Model input matching the model's schema"),
    kind: z.enum(["image", "video"]),
    prompt: z
      .string()
      .describe("The human-readable prompt, stored with the asset"),
    referencedAssetIds: z.array(z.string()).optional(),
  }),
  async execute(input) {
    const res = await fetch(
      `${process.env.NUSOMA_INTERNAL_URL}/api/internal/generate`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-nusoma-secret": process.env.NUSOMA_SERVICE_SECRET!,
        },
        body: JSON.stringify(input),
      },
    );
    return await res.json();
  },
});
