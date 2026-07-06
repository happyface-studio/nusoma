# Auth Hardening — Server-Verified Identity — Design

**Date:** 2026-07-06
**Status:** Approved design, pre-implementation
**Owner:** Simon Weniger
**Base branch:** `feat/auth-hardening` (off `feat/monorepo`) → PR #3 after PR #2 merges

> **Update (2026-07-06) — SSE auth via header-capable EventSource ponyfill.**
> The HMAC stream-token design below (decision row "SSE stream auth", §4.2,
> and the `streamToken` parts of §4.5–4.7, §6, §7, §10) is **superseded**. Four
> of the billed procedures are tRPC `subscription`s that ride
> `httpSubscriptionLink` (SSE) and cannot send an `Authorization` header; tRPC's
> only built-in fallback (`connectionParams`) serializes the credential into the
> URL query string (verified in `@trpc/client@11.18.0`), which would leak the
> long-lived refresh token into request logs. Instead we adopt a **header-capable
> EventSource ponyfill** (`extended-eventsource`) so the **Bearer token flows
> uniformly** to the batch link, the 4 SSE subscriptions, AND `/api/agent/stream`.
> This **removes** `stream-token.ts`, `STREAM_TOKEN_SECRET`, and the
> `run → streamToken` handoff entirely; no credential ever rides in a URL. The
> agent-stream route is authorized by verifying the Bearer user **and** binding
> the request to a `projectId` the user owns whose stored `eveSessionState.sessionId`
> matches the requested stream (single indexed ownership query; no schema/perms
> change). The authoritative implementation is
> `docs/superpowers/plans/2026-07-06-auth-hardening.md`.

## 1. Summary

Close the accepted "trust-the-input" findings: nusoma's server currently derives
billing/ownership identity (`userId`/`sessionId`) from **client-supplied request
input**, because no server code can identify the caller (tRPC `ctx` is `{ req }`;
`db.auth.verifyToken()` is never called; the InstantDB session token is never sent
to the server). This lets a caller spend another user's credits and act on another
user's projects.

Fix: the client sends its InstantDB token; the server **verifies** it and derives
identity from the verified user — never from input. **Auth is required** for every
billed/agent operation (the anonymous/guest billing path is dropped). Ownership is
enforced on the agent endpoints. The SSE stream — which can't send an auth header —
is authorized with a short-lived server-signed capability token.

**Core principle: identity is server-verified, never client-asserted.**

## 2. Decisions made (with rationale)

| Decision            | Choice                                                           | Rationale                                                                                                                |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Identity transport  | Client sends InstantDB token as `Authorization: Bearer <token>`  | Only transmittable credential; matches InstantDB's documented server-verify pattern.                                     |
| Verification        | `@instantdb/admin` `db.auth.verifyToken(token) → User{ id }`     | Confirmed against installed types; `User.id` is the trusted `userId`.                                                    |
| Anonymous flow      | **Dropped** for billed/agent ops — auth required                 | User decision. Anonymous users already can't spend credits; removes the whole spoof surface.                             |
| Scope               | **App-wide** — all billed tRPC procedures + both agent routes    | Finding #2 implicates every billed `publicProcedure`, not just the agent path.                                           |
| SSE stream auth     | **Header-capable EventSource ponyfill** (`extended-eventsource`) → Bearer everywhere (see Update note) | Native `EventSource` can't set headers and tRPC `connectionParams` leak the token into the URL; a ponyfill sends the Bearer header for all SSE, so no credential ever rides in a URL. Supersedes the HMAC row. |
| perms.ts tightening | **Out of scope** (separate follow-up)                            | InstantDB perms govern direct-from-client queries — a distinct surface; tightening risks breaking existing client reads. |

## 3. Architecture

```
Client (@instantdb/react)                 Server (apps/web)
  useAuth().user.refresh_token
        │  Authorization: Bearer <token>
        ├──────────────── tRPC httpBatchLink headers ─────▶ createContext extracts token
        │                                                    protectedProcedure:
        │                                                      db.auth.verifyToken → ctx.user{id}
        │                                                    billed proc derives userId = ctx.user.id
        │
        ├── POST /api/agent/run (Bearer) ────────────────▶ verifyRequestUser(req) → userId
        │                                                    assert project.user.id === userId (403)
        │   ◀─── { runId, eveSessionId, streamToken } ────  mintStreamToken(sid, userId)
        │
        └── EventSource /stream/{sid}?t=streamToken ─────▶ verifyStreamToken(t, sid) (403)
                                                             proxy eve NDJSON
```

The token holder (`authToken.ts`) is a client module updated by the auth provider on
auth change; both the tRPC `headers` callback and `useAgentRun` read it — single source.

## 4. Components

### 4.1 `apps/web/src/lib/auth/verify.ts` (new)

- `bearerToken(req): string | null` — pull the token out of the `Authorization: Bearer …` header.
- `verifyRequestUser(req): Promise<{ id: string; email: string | null }>` — `bearerToken` →
  `db.auth.verifyToken(token)` (admin client from `lib/instant-admin.ts`); throws a typed
  `AuthError` (→ 401) when the header is missing or the token is invalid. Shared by the
  tRPC context and the agent routes.

### 4.2 `apps/web/src/lib/auth/stream-token.ts` (new)

- `mintStreamToken(sessionId, userId, ttlSeconds = 300): string` — payload `{ sid, uid, exp }`,
  base64url-encoded, appended with an HMAC-SHA256 (`STREAM_TOKEN_SECRET`) over the payload.
- `verifyStreamToken(token, sessionId): boolean` — recompute HMAC, `crypto.timingSafeEqual`
  compare, check `exp > now`, check `sid === sessionId`. Any failure → false.
- Pure Node `crypto`; **unit-tested** (mirrors `generate-core.test.ts`).

### 4.3 tRPC — `protectedProcedure` (`apps/web/src/server/trpc/{context,init}.ts`)

- `createContext(req)` unchanged in shape but the middleware reads `req` for the token.
- New `protectedProcedure = publicProcedure.use(mw)` where `mw` calls `verifyRequestUser(ctx.req)`
  and injects `ctx.user = { id, email }`; missing/invalid → `TRPCError({ code: 'UNAUTHORIZED' })`.

### 4.4 Billed procedures (`apps/web/src/server/trpc/routers/_app.ts`)

- Every billed procedure (all image/video generation mutations + `getUserCredits`) switches
  `publicProcedure → protectedProcedure`.
- `userId` is taken from `ctx.user.id`; `userId`/`sessionId` are **removed** from each input schema.
- `BillingUser` is built as `{ userId: ctx.user.id }` (billing.ts's anonymous branch is now
  unreachable on these paths; billing.ts internals are left unchanged — not refactored).

### 4.5 `/api/agent/run` (`apps/web/src/app/api/agent/run/route.ts`)

- `verifyRequestUser(req)` → `userId` (401 on failure). `userId`/`sessionId` removed from `BodySchema`.
- **Ownership:** admin-query `canvasProjects[projectId]{ user }`; require `project.user?.id === userId`,
  else **403** (a project with no user link — anonymous — also fails, per auth-required).
- Mint the run bound to `userId` (as today), then `mintStreamToken(eveSessionId, userId)`.
- Response gains `streamToken`: `{ runId, eveSessionId, streamToken }`.

### 4.6 `/api/agent/stream/[sessionId]` (`apps/web/src/app/api/agent/stream/[sessionId]/route.ts`)

- Read `t` (query param). `verifyStreamToken(t, sessionId)` → false ⇒ **403**. Then proxy as today.
- The existing sessionId regex/SSRF hardening stays.

### 4.7 Client wiring

- `apps/web/src/lib/auth/authToken.ts` (new) — module-level `getAuthToken()` / `setAuthToken(t)`.
- Auth provider (`providers/auth-provider.tsx`) calls `setAuthToken(user?.refresh_token ?? null)` on auth change.
- tRPC client (`trpc/*` client setup): `httpBatchLink({ headers: () => token ? { authorization: \`Bearer ${token}\` } : {} })`.
- `useAgentRun.start()`: send the `Authorization` header, **drop** `userId`/`sessionId` from the body,
  and open `EventSource(.../stream/${eveSessionId}?t=${streamToken}&startIndex=…)`.
- `getUserCredits` now requires auth: the credits UI treats a 401/no-user as `0` (logged-out) — the query
  runs client-side where the token exists.

## 5. Data flow

**Billed generation:** client mutation → tRPC sends Bearer → `protectedProcedure` verifies → `ctx.user.id` →
`checkCreditsForGeneration({ userId })` → charge → result. No `userId` ever crosses from input.

**Agent run:** `useAgentRun.start()` POSTs `/api/agent/run` with Bearer → verify → ownership check (403 if not owner)
→ mint run + `streamToken` → client opens `EventSource?t=streamToken` → stream route verifies token (403 otherwise) → proxies.

## 6. Error handling

- Missing/invalid token → **401** (`UNAUTHORIZED` for tRPC; `Response(401)` for routes).
- Verified user is not the project owner → **403**.
- Invalid/expired/mismatched stream token → **403**.
- `STREAM_TOKEN_SECRET` unset at boot → the route fails closed (500, never "allow"). Documented env var.

## 7. Testing

- **Unit (bun test, `apps/web`):** `stream-token.test.ts` — round-trip valid; tampered payload → false;
  expired (`exp` in past) → false; wrong `sessionId` → false; bad secret → false. Pure, deterministic.
- **Manual/integration (deferred to live pass):** real login → token reaches server → generation succeeds;
  a request with a spoofed body `userId` → 401/403; `/api/agent/run` for a project you don't own → 403;
  an `EventSource` with a forged or expired `t` → 403; a logged-out user sees 0 credits (no crash).

## 8. Scope boundaries (deliberate cuts)

- **No `instant.perms.ts` changes** — the direct-from-client InstantDB bypass (open `agentRuns`,
  open `canvasProjects.create`) is a separate follow-up.
- **No anonymous project model change** — `canvasProjects.sessionId` stays; only _billed/agent_ endpoints
  now require auth.
- **No billing.ts refactor** — feed it the verified `userId`; leave its (now-unreachable) anonymous branch.
- **No new auth UI** — login is unchanged; this only adds server verification of the existing session.

## 9. Confirmed APIs (verified against installed types, not assumed)

- `@instantdb/admin@0.22.185`: `db.auth.verifyToken(token: AuthToken): Promise<User>`; JSDoc shows the
  exact server pattern `const user = await db.auth.verifyToken(req.headers['token'])`. `db.asUser({ token })` exists.
- `@instantdb/core@0.22.185`: `User = { id: string; refresh_token: string; email?: string | null; imageURL?: … }`.
  Client obtains the token as `useAuth().user.refresh_token`.
- Ownership check uses an explicit admin query + `id` comparison (not `asUser` + perms), so it does **not**
  depend on the perms rules we're deferring.

## 10. Risks accepted

- **Refresh token in a Bearer header on every request** — it's the client's existing long-lived session token,
  sent same-origin over HTTPS; this is InstantDB's sanctioned server-verify pattern. Not logged by app code.
- **Dropping anonymous billed generation** — accepted product change; anonymous users couldn't spend credits anyway.
- **Per-request `verifyToken` round-trip** — one extra admin call per billed request; acceptable, cache later if measured.
- **`STREAM_TOKEN_SECRET` is new required env** — must be set in every environment (web app), or the stream fails closed.
