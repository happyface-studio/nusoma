import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Read the current canvas project: its assets, their prompts, and lineage. Use before generating if the brief refers to existing assets.",
  inputSchema: z.object({
    projectId: z.string().describe("The projectId given in your context."),
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
