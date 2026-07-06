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
    case "actions.requested": {
      // eve streams `data.actions: RuntimeActionRequest[]`; a tool-call carries
      // { toolName, input }, other kinds (subagent-call, load-skill) carry `kind`.
      const label = (ev.data?.actions ?? [])
        .map(
          (a: any) =>
            `${a?.toolName ?? a?.kind ?? "action"}(${JSON.stringify(a?.input ?? {}).slice(0, 100)})`,
        )
        .join(", ");
      return { text: `▸ ${label || "action"}`, tone: "act" };
    }
    case "action.result": {
      // eve streams `data.result: RuntimeActionResult` (+ `data.status`,
      // `data.error`). The tool's return value is `result.output` — for the
      // `generate` tool that's the /api/internal/generate response:
      // { assetId, ... } on success, { error } on a handled failure.
      const result = ev.data?.result;
      const output = result?.output;
      const hasErrorField =
        !!output && typeof output === "object" && "error" in output;
      if (
        ev.data?.status === "failed" ||
        ev.data?.status === "rejected" ||
        result?.isError === true ||
        hasErrorField
      ) {
        const msg =
          (hasErrorField && (output as { error?: unknown }).error) ||
          ev.data?.error?.message ||
          ev.data?.status ||
          "failed";
        return {
          text: `✗ ${typeof msg === "string" ? msg : JSON.stringify(msg)}`,
          tone: "err",
        };
      }
      if (!!output && typeof output === "object" && "assetId" in output) {
        const o = output as { assetId: unknown; credits?: unknown };
        return {
          text: `✓ asset ${String(o.assetId).slice(0, 8)} · ${o.credits ?? "?"} credits`,
          tone: "ok",
        };
      }
      const name =
        result?.toolName ?? result?.subagentName ?? result?.kind ?? "done";
      return { text: `✓ ${name}`, tone: "ok" };
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
