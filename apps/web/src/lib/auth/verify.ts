import { db } from "@/lib/instant-admin";

/** Thrown when a request carries no valid InstantDB session token. Maps to 401. */
export class AuthError extends Error {
  constructor(message = "unauthenticated") {
    super(message);
    this.name = "AuthError";
  }
}

/** Pull the token out of an `Authorization: Bearer <token>` header. Pure. */
export function bearerToken(req: {
  headers: { get(name: string): string | null };
}): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token ? token : null;
}

/**
 * Verify the caller's InstantDB token and return the trusted identity.
 * Throws AuthError when the header is missing or the token is invalid.
 */
export async function verifyRequestUser(req: {
  headers: { get(name: string): string | null };
}): Promise<{ id: string; email: string | null }> {
  const token = bearerToken(req);
  if (!token) throw new AuthError("missing bearer token");
  let user;
  try {
    user = await db.auth.verifyToken(token);
  } catch {
    throw new AuthError("invalid token");
  }
  if (!user?.id) throw new AuthError("invalid token");
  return { id: user.id, email: user.email ?? null };
}
