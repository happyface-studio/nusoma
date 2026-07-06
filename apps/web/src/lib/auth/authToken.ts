// Single client-side source of truth for the InstantDB session token.
// Set by the auth provider on auth change; read by the tRPC links and useAgentRun.

let currentToken: string | null = null;

export function setAuthToken(token: string | null): void {
  currentToken = token;
}

export function getAuthToken(): string | null {
  return currentToken;
}

/** Authorization header for authed requests; empty object when logged out. */
export function authHeader(): Record<string, string> {
  return currentToken ? { authorization: `Bearer ${currentToken}` } : {};
}
