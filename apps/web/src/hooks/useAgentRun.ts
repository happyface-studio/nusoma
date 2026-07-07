import { useCallback, useEffect, useRef, useState } from "react";

export type AgentEvent = { type: string; data?: any };

export function useAgentRun() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "failed">(
    "idle",
  );
  const indexRef = useRef(0);
  const esRef = useRef<EventSource | null>(null);
  const doneRef = useRef(false);

  // Close any open stream when the component using this hook unmounts.
  useEffect(() => () => esRef.current?.close(), []);

  const start = useCallback(
    async (args: {
      projectId: string;
      // InstantDB refresh token; proves the caller's identity to /api/agent/run.
      authToken?: string;
      sessionId?: string;
      brief: string;
      kind?: "image" | "video";
      aspectRatio?: string;
      referencedAssetIds?: string[];
      placement?: { x: number; y: number; width: number; height: number };
    }) => {
      esRef.current?.close();
      doneRef.current = false;
      indexRef.current = 0;
      setEvents([]);
      setStatus("running");

      const { authToken, ...body } = args;
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const { eveSessionId, streamToken } = await res.json();
      if (!eveSessionId || !streamToken) {
        doneRef.current = true;
        setStatus("failed");
        return;
      }

      const open = () => {
        const es = new EventSource(
          `/api/agent/stream/${eveSessionId}?startIndex=${indexRef.current}&token=${streamToken}`,
        );
        esRef.current = es;
        es.onmessage = (m) => {
          let ev: AgentEvent;
          try {
            ev = JSON.parse(m.data) as AgentEvent;
          } catch {
            return;
          }
          indexRef.current += 1;
          setEvents((prev) => [...prev, ev]);
          if (ev.type === "session.completed" || ev.type === "session.failed") {
            doneRef.current = true;
            setStatus(ev.type === "session.completed" ? "done" : "failed");
            es.close();
          }
        };
        es.onerror = () => {
          es.close();
          // Reconnect from the cursor while the run is still active, with a backoff so a
          // down agent isn't hammered. A run ends naturally via session.completed/failed.
          if (!doneRef.current) setTimeout(open, 1500);
        };
      };
      open();
    },
    [],
  );

  return { start, events, status };
}
