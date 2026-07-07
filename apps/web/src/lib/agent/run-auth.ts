// Decides who may start an agent run on a project, and which identity gets
// billed. Resolved SERVER-SIDE from the project row and a verified refresh
// token — never from a client-asserted userId, which would let anyone spend
// another user's credits.

export type ProjectOwnership = {
  ownerUserId?: string; // the project's linked $users id, if any
  projectSessionId?: string; // guest cookie the project was created under, if any
};

export type RunIdentity =
  { ok: true; userId?: string; sessionId?: string } | { ok: false };

export function resolveRunIdentity(
  project: ProjectOwnership,
  verifiedUserId: string | undefined,
  callerSessionId: string | undefined,
): RunIdentity {
  if (project.ownerUserId) {
    // User-owned project: only that user, proven via refresh token.
    return project.ownerUserId === verifiedUserId
      ? { ok: true, userId: verifiedUserId }
      : { ok: false };
  }
  if (project.projectSessionId) {
    // Guest project: caller must hold the same session cookie it was created
    // under. A signed-in user on their own guest project still bills as a user.
    return callerSessionId && project.projectSessionId === callerSessionId
      ? { ok: true, userId: verifiedUserId, sessionId: callerSessionId }
      : { ok: false };
  }
  // No owner of any kind — fail closed.
  return { ok: false };
}
