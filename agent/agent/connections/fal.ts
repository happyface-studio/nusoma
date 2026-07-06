import { defineMcpClientConnection } from "eve/connections";

// Discovery only. Execution goes through nusoma's `generate` tool, never fal's run/submit.
export default defineMcpClientConnection({
  url: "https://mcp.fal.ai/mcp",
  description:
    "fal.ai model catalog. Use to search models, read their input schemas, and check pricing before generating.",
  auth: {
    getToken: async () => ({ token: process.env.FAL_KEY! }),
  },
  tools: {
    allow: [
      "search_models",
      "get_model_schema",
      "check_pricing",
      "recommend_models",
    ],
  },
});
