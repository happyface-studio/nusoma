import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Read the current canvas project for THIS run (its assets, prompts, and lineage). Use before generating if the brief refers to existing assets. Pass the runId from your context.",
  inputSchema: z.object({
    runId: z
      .string()
      .describe("The runId given in your context. Do not invent one."),
  }),
  async execute(input) {
    const res = await fetch(
      `${process.env.NUSOMA_INTERNAL_URL}/api/internal/project`,
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
