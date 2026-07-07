import { eveChannel } from "eve/channels/eve";
import {
  httpBasic,
  localDev,
  placeholderAuth,
  vercelOidc,
} from "eve/channels/auth";

// Shared secret the nusoma web backend presents (as the AGENT_AUTH_TOKEN it
// sends in agentHeaders()). Server-to-server only, over HTTPS. When unset the
// Basic entry drops out, leaving vercelOidc()/localDev() — fine for `eve dev`,
// and fail-closed in production (unrecognized callers fall to placeholderAuth's
// 401 rather than being let through).
const webToken = process.env.AGENT_AUTH_TOKEN;

export default eveChannel({
  auth: [
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // The nusoma web backend authenticates with a shared secret (constant-time
    // compared). Same value as AGENT_AUTH_TOKEN in apps/web.
    ...(webToken
      ? [httpBasic({ username: "nusoma-web", password: webToken })]
      : []),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    // Fail closed: any production request without a recognized credential 401s.
    placeholderAuth(),
  ],
});
