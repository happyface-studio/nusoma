"use client";
import type { AgentEvent } from "@/hooks/useAgentRun";

function line(
  ev: AgentEvent,
): { text: string; tone: "dim" | "act" | "ok" | "err" } | null {
  switch (ev.type) {
    case "reasoning.appended":
      return {
        text: ev.data?.reasoningDelta ?? ev.data?.text ?? "",
        tone: "dim",
      };
    case "actions.requested":
      return {
        text: `▸ ${ev.data?.name ?? "tool"}(${JSON.stringify(ev.data?.input ?? {}).slice(0, 120)})`,
        tone: "act",
      };
    case "action.result": {
      const r = ev.data?.result ?? ev.data;
      if (r?.error) return { text: `✗ ${r.error}`, tone: "err" };
      if (r?.assetId)
        return {
          text: `✓ asset ${String(r.assetId).slice(0, 8)} · ${r.credits ?? "?"} credits`,
          tone: "ok",
        };
      return { text: "✓ done", tone: "ok" };
    }
    case "session.completed":
      return { text: "— run complete —", tone: "ok" };
    case "session.failed":
      return { text: "— run failed —", tone: "err" };
    default:
      return null;
  }
}

const TONE = {
  dim: "#7a7a7a",
  act: "#8ab4ff",
  ok: "#6ee7a8",
  err: "#ff6b6b",
} as const;

export function AgentLogOverlay({
  events,
  visible,
}: {
  events: AgentEvent[];
  visible: boolean;
}) {
  if (!visible) return null;
  const lines = events.map(line).filter(Boolean) as {
    text: string;
    tone: keyof typeof TONE;
  }[];
  return (
    <div
      style={{
        position: "absolute",
        right: 16,
        bottom: 16,
        width: 380,
        maxHeight: 260,
        overflowY: "auto",
        background: "rgba(0,0,0,0.85)",
        border: "1px solid #222",
        borderRadius: 8,
        padding: 12,
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        lineHeight: 1.5,
        zIndex: 50,
      }}
    >
      {lines.length === 0 ? (
        <span style={{ color: TONE.dim }}>waiting for the agent…</span>
      ) : (
        lines.map((l, i) => (
          <div key={i} style={{ color: TONE[l.tone], whiteSpace: "pre-wrap" }}>
            {l.text}
          </div>
        ))
      )}
    </div>
  );
}
