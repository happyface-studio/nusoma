import { useCallback, useRef, useState } from "react";

export type AgentEvent = { type: string; data?: any };

export function useAgentRun() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "failed">(
    "idle",
  );
  const indexRef = useRef(0);

  const start = useCallback(
    async (args: {
      projectId: string;
      userId?: string;
      sessionId?: string;
      brief: string;
      kind?: "image" | "video";
      aspectRatio?: string;
      referencedAssetIds?: string[];
    }) => {
      setEvents([]);
      setStatus("running");
      indexRef.current = 0;
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const { eveSessionId } = await res.json();

      const open = () => {
        const es = new EventSource(
          `/api/agent/stream/${eveSessionId}?startIndex=${indexRef.current}`,
        );
        es.onmessage = (m) => {
          const ev = JSON.parse(m.data) as AgentEvent;
          indexRef.current += 1;
          setEvents((prev) => [...prev, ev]);
          if (ev.type === "session.completed") {
            setStatus("done");
            es.close();
          }
          if (ev.type === "session.failed") {
            setStatus("failed");
            es.close();
          }
        };
        es.onerror = () => {
          es.close();
          if (indexRef.current >= 0) open();
        }; // reconnect from cursor
      };
      open();
    },
    [],
  );

  return { start, events, status };
}
