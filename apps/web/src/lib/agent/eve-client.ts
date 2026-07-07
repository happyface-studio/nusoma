// Thin HTTP client for eve's session API. nusoma talks to the eve agent over plain
// HTTP/JSON (the "thin waist"), so there is deliberately NO dependency on the `eve` package.
export const AGENT_URL = process.env.AGENT_URL!;

export type EveSessionState = {
  continuationToken?: string;
  sessionId?: string;
  streamIndex: number;
};

export function agentHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  // Server-to-server auth for the eve HTTP channel: HTTP Basic shared secret,
  // verified by the agent's httpBasic("nusoma-web") channel (constant-time).
  // Set the same value as AGENT_AUTH_TOKEN on the agent. See
  // apps/agent/agent/channels/eve.ts. Locally (localDev) the agent ignores it.
  const token = process.env.AGENT_AUTH_TOKEN;
  if (token) {
    headers["authorization"] = `Basic ${btoa(`nusoma-web:${token}`)}`;
  }
  return headers;
}
