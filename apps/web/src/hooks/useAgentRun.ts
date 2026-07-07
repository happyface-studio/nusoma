import { useCallback, useEffect, useRef, useState } from "react";
import { EventSource } from "extended-eventsource";
import { authHeader } from "@/lib/auth/authToken";

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

      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeader() },
        body: JSON.stringify(args),
      });
      if (!res.ok) {
        doneRef.current = true;
        setStatus("failed");
        return;
      }
      const { eveSessionId } = await res.json();
      if (!eveSessionId) {
        doneRef.current = true;
        setStatus("failed");
        return;
      }

      const open = () => {
        // projectId authorizes the stream server-side (owner + session match);
        // the Bearer header authenticates. disableRetry keeps our cursor-based
        // reconnect (below) the single source of reconnection truth.
        const es = new EventSource(
          `/api/agent/stream/${eveSessionId}?startIndex=${indexRef.current}&projectId=${encodeURIComponent(args.projectId)}`,
          { headers: authHeader(), disableRetry: true },
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
          // Reconnect from the cursor while the run is still active, with a
          // backoff so a down agent isn't hammered. A run ends naturally via
          // session.completed/failed.
          if (!doneRef.current) setTimeout(open, 1500);
        };
      };
      open();
    },
    [],
  );

  return { start, events, status };
}
