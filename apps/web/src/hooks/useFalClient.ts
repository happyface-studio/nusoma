import React from "react";
import { createFalClient } from "@fal-ai/client";

// Custom hook for FAL client
export const useFalClient = () => {
  return React.useMemo(() => {
    return createFalClient({
      proxyUrl: "/api/fal",
    });
  }, []);
};
