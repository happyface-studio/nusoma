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
  // Optional route-auth for the eve HTTP channel (set AGENT_AUTH_TOKEN if the agent requires it).
  if (process.env.AGENT_AUTH_TOKEN) {
    headers["authorization"] = `Bearer ${process.env.AGENT_AUTH_TOKEN}`;
  }
  return headers;
}
