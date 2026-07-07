# Auth Hardening — Server-Verified Identity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the server verify the caller's identity for every billed/agent operation and derive `userId` from that verified identity — never from client input — closing the accepted trust-the-input findings.

**Architecture:** The client sends its InstantDB refresh token as `Authorization: Bearer <token>` on all tRPC batch requests, both agent routes, AND the 4 SSE subscriptions (via a header-capable `EventSource` ponyfill). The server verifies the token with `db.auth.verifyToken()` and takes `userId` from the verified user. A tRPC `protectedProcedure` injects `ctx.user`; the agent routes call a shared `verifyRequestUser(req)`. Ownership is enforced with a single indexed InstantDB query on the `canvasProjects.user` link.

**Tech Stack:** Next.js 16 / React 19, tRPC v11 (`@trpc/client`/`@trpc/server` 11.18), `@instantdb/admin` 0.22 (`db.auth.verifyToken`), `extended-eventsource` 2.1 (SSE ponyfill), Polar billing, bun (`bun test`).

> **Note:** This plan supersedes the HMAC stream-token parts of the design doc (`docs/superpowers/specs/2026-07-06-auth-hardening-design.md` §4.2, §4.5–4.7 `streamToken`) per the 2026-07-06 ponyfill decision — see the Update note at the top of that spec. There is **no** `stream-token.ts`, no `STREAM_TOKEN_SECRET`, and no `streamToken` in any response.

## Global Constraints

- **Identity is server-verified, never client-asserted.** No billed/agent code path may read `userId`/`sessionId` from request input.
- **Auth is required** for every billed/agent operation. The anonymous/guest billing path is dropped (billing.ts internals are left unchanged — its now-unreachable anonymous branch stays).
- **Token transport:** `Authorization: Bearer <instantdb refresh_token>` on tRPC batch requests, `/api/agent/run`, `/api/agent/stream`, and the 4 SSE subscriptions. **No credential ever rides in a URL.**
- **Verification:** `db.auth.verifyToken(token)` from `@/lib/instant-admin`. Missing/invalid token → **401** for routes (`Response` 401) and `TRPCError({ code: 'UNAUTHORIZED' })` for tRPC.
- **Ownership:** `/api/agent/run` and `/api/agent/stream` require the verified user to own the target project (single indexed query on the `canvasProjects.user` link, filtered with the `"user.id"` dot-path). Not-owned or not-found → **403/404** (collapse to avoid leaking existence where noted).
- **Exact dependency:** `extended-eventsource@^2.1.0` (added to `apps/web/package.json`). Constructor: `new EventSource(url, { headers, disableRetry?, retry?, ... })`, standard interface (`onmessage`/`onerror`/`onopen`/`close`/`readyState`).
- **Out of scope (do NOT touch):** `instant.perms.ts`, `billing.ts` internals, `createCheckoutSession`/`getCreditPackages` (not billed generation — they stay `publicProcedure`), the `sessionId` cookie / anonymous project model.
- DRY, YAGNI, TDD, frequent commits. Run tests from `apps/web` (`cd apps/web`). Each task must leave `cd apps/web && bunx tsc --noEmit` with **no new** errors (web has ~13 pre-existing tsc errors unrelated to this branch — do not fix them, just don't add any) and `cd apps/web && bun test` green.

---

## Confirmed facts (verified against installed code — do not re-derive)

- `db.auth.verifyToken: (token) => Promise<User>` — POSTs to the verify endpoint and returns `res.user`; **throws** (via `jsonFetch`) on an invalid token. `User = { id: string; refresh_token: string; email?: string | null; ... }`.
- tRPC context (`apps/web/src/server/trpc/context.ts`) already carries `req` (`{ req }`); the route handler builds it via `createContext(req)`.
- The 7 billed generation procedures + `getUserCredits` in `apps/web/src/server/trpc/routers/_app.ts` are all `publicProcedure` and read `input.userId`/`input.sessionId`. Four are `.subscription()` (`transformVideo`, `generateImageToVideo`, `generateTextToVideo`, `generateImageStream`); three are `.mutation()` (`removeBackground`, `isolateObject`, `generateTextToImage`); `getUserCredits` is a `.query()`.
- `canvasProjects` has a to-one `user` link (`forward: { on: "canvasProjects", has: "one", label: "user" }`). The codebase already filters by `"user.id"` (e.g. `AppLayout.tsx`, `auth-provider.tsx`).
- `canvasProjects.eveSessionState` is `i.json().optional()` shaped `{ continuationToken?, sessionId?, streamIndex }`.
- Client callsites that pass identity (must be updated when input fields are dropped): `StreamingVideo.tsx` (2 subscription calls, lines ~72/131), `canvas/[id]/page.tsx` `handleRun` (line ~1877) + 2 `getUserCredits` calls (line ~251), `dashboard/AppLayout.tsx` `getUserCredits` (line ~109). The `userId`/`sessionId` set on local generation maps / `canvasStorage.setUser` are NOT tRPC input — leave them.
- tRPC link config lives in `apps/web/src/app/core-providers.tsx` (`splitLink` → `httpSubscriptionLink` for subscriptions, `httpBatchLink` otherwise). Token holder consumed there and in `useAgentRun`.
- `/api/internal/generate/route.ts` derives billing from the **stored** `run.userId` — no change needed; once the run stores the verified userId (Task 4) this path bills the verified user automatically.

---

### Task 1: Server auth helper `lib/auth/verify.ts` + unit test

**Files:**
- Create: `apps/web/src/lib/auth/verify.ts`
- Test: `apps/web/src/lib/auth/verify.test.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/instant-admin` (`db.auth.verifyToken`).
- Produces:
  - `class AuthError extends Error` (marker for "unauthenticated").
  - `bearerToken(req: { headers: { get(name: string): string | null } }): string | null` — pure header parse.
  - `verifyRequestUser(req): Promise<{ id: string; email: string | null }>` — throws `AuthError` when the header is missing or the token is invalid.

- [ ] **Step 1: Write the failing test** — `apps/web/src/lib/auth/verify.test.ts`

```typescript
import { test, expect } from "bun:test";
import { bearerToken } from "./verify";

function reqWith(auth: string | null) {
  return { headers: { get: (n: string) => (n.toLowerCase() === "authorization" ? auth : null) } };
}

test("bearerToken extracts the token from a Bearer header", () => {
  expect(bearerToken(reqWith("Bearer abc.def.ghi"))).toBe("abc.def.ghi");
});

test("bearerToken is case-insensitive on the scheme", () => {
  expect(bearerToken(reqWith("bearer tok123"))).toBe("tok123");
});

test("bearerToken returns null when the header is absent", () => {
  expect(bearerToken(reqWith(null))).toBeNull();
});

test("bearerToken returns null for a non-Bearer scheme", () => {
  expect(bearerToken(reqWith("Basic Zm9vOmJhcg=="))).toBeNull();
});

test("bearerToken returns null when the token is empty", () => {
  expect(bearerToken(reqWith("Bearer "))).toBeNull();
  expect(bearerToken(reqWith("Bearer"))).toBeNull();
});

test("bearerToken trims surrounding whitespace", () => {
  expect(bearerToken(reqWith("Bearer   tok  "))).toBe("tok");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/lib/auth/verify.test.ts`
Expected: FAIL — `Cannot find module "./verify"`.

- [ ] **Step 3: Write minimal implementation** — `apps/web/src/lib/auth/verify.ts`

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test src/lib/auth/verify.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: no NEW errors introduced by `verify.ts`/`verify.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/auth/verify.ts apps/web/src/lib/auth/verify.test.ts
git commit -m "feat(auth): add server-side request identity verification helper"
```

---

### Task 2: Client auth transport — token holder, provider wiring, tRPC links (Bearer + ponyfill)

**Files:**
- Create: `apps/web/src/lib/auth/authToken.ts`
- Modify: `apps/web/src/providers/auth-provider.tsx` (set token on auth change)
- Modify: `apps/web/src/app/core-providers.tsx` (Bearer header on batch link + ponyfill on subscription link)
- Modify: `apps/web/package.json` (add `extended-eventsource`)

**Interfaces:**
- Produces:
  - `getAuthToken(): string | null` and `setAuthToken(token: string | null): void` — module-level holder read by the tRPC links and `useAgentRun` (Task 3).
  - `authHeader(): Record<string, string>` — returns `{ authorization: \`Bearer ${token}\` }` when a token is set, else `{}`.

- [ ] **Step 1: Add the dependency**

Run: `cd apps/web && bun add extended-eventsource@^2.1.0`
Expected: `apps/web/package.json` gains `"extended-eventsource": "^2.1.0"` under `dependencies`; `bun.lock` updates.

- [ ] **Step 2: Create the token holder** — `apps/web/src/lib/auth/authToken.ts`

```typescript
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
```

- [ ] **Step 3: Wire the auth provider** — `apps/web/src/providers/auth-provider.tsx`

Add the import near the other imports (after line 8, `import { db } from "@/lib/db";`):

```typescript
import { setAuthToken } from "@/lib/auth/authToken";
```

Inside `AuthProvider`, immediately after `const { isLoading: authIsLoading, user, error } = db.useAuth();` (line 30), set the token during render so it is available before any child effect fires a request:

```typescript
  // Keep the client token holder in sync with the verified InstantDB session.
  // Set during render (not in an effect) so it is populated before child
  // components mount and fire their first authed request.
  setAuthToken((user as { refresh_token?: string } | null)?.refresh_token ?? null);
```

- [ ] **Step 4: Wire the tRPC links** — `apps/web/src/app/core-providers.tsx`

Add imports (after the existing `@trpc/client` import block, and the ponyfill):

```typescript
import { EventSource as HeaderEventSource } from "extended-eventsource";
import { authHeader } from "@/lib/auth/authToken";
```

Change the `httpSubscriptionLink` to use the ponyfill with the Bearer header, and add the Bearer header to `httpBatchLink`:

```typescript
      links: [
        splitLink({
          condition: (op) => op.type === "subscription",
          true: httpSubscriptionLink({
            transformer: superjson,
            url: getUrl(),
            // Native EventSource can't send headers; this ponyfill can. The
            // callback is read per (re)connection, so the current token is used.
            EventSource:
              HeaderEventSource as unknown as typeof globalThis.EventSource,
            eventSourceOptions: () => ({ headers: authHeader() }),
          }),
          false: httpBatchLink({
            transformer: superjson,
            url: getUrl(),
            headers() {
              return {
                "x-trpc-source": "client",
                ...authHeader(),
              };
            },
          }),
        }),
      ],
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: no NEW errors. (If tRPC's `EventSourceLike.AnyConstructor` rejects the ponyfill type, the `as unknown as typeof globalThis.EventSource` cast above resolves it — it is already included.)

- [ ] **Step 6: Build sanity (the ponyfill must resolve in the client bundle)**

Run: `cd apps/web && bun test`
Expected: existing suites still green (8/8 money-path + 6 auth from Task 1). No runtime import of the ponyfill in tests; this step just confirms nothing broke.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/auth/authToken.ts apps/web/src/providers/auth-provider.tsx apps/web/src/app/core-providers.tsx apps/web/package.json apps/web/bun.lock
git commit -m "feat(auth): send Bearer token from tRPC batch + subscription links"
```

---

### Task 3: `useAgentRun` — ponyfill + Bearer + projectId; update `handleRun` callsite

**Files:**
- Modify: `apps/web/src/hooks/useAgentRun.ts`
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx` (the `handleRun` callsite, ~line 1877)

**Interfaces:**
- Consumes: `authHeader` from `@/lib/auth/authToken`; `EventSource` from `extended-eventsource`.
- Produces: `start(args)` where `args` no longer contains `userId`/`sessionId` but **requires** `projectId` (used to authorize the stream). Signature:
  `start(args: { projectId: string; brief: string; kind?: "image" | "video"; aspectRatio?: string; referencedAssetIds?: string[] }): Promise<void>`.

- [ ] **Step 1: Rewrite `useAgentRun.ts`**

Replace the file body with (drops `userId`/`sessionId`, sends Bearer on both the POST and the stream, passes `projectId` to the stream, disables the ponyfill's auto-retry so the existing cursor-based reconnect stays authoritative):

```typescript
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
```

- [ ] **Step 2: Update the `handleRun` callsite** — `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx` (~line 1877)

Remove the `userId` and `sessionId` lines from the `startAgentRun({ ... })` call so it matches the new signature:

```typescript
    await startAgentRun({
      projectId,
      brief: generationSettings.prompt ?? "",
      kind,
      aspectRatio: generationSettings.imageSize,
      referencedAssetIds: generationSettings.referencedAssetIds,
    });
```

(Everything else in `handleRun` is unchanged. `startAgentRun` is the `start` returned by `useAgentRun()`.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: no NEW errors. The dropped `userId`/`sessionId` in `start`'s arg type make the old callsite lines type-errors until removed — Step 2 removes them.

- [ ] **Step 4: Confirm no other `useAgentRun().start(` callsite still passes identity**

Run: `cd /Users/vonweniger/GitHub/nusoma && grep -rn "startAgentRun(\|\.start({" apps/web/src/app apps/web/src/components --include="*.tsx" | grep -v node_modules`
Expected: only the `handleRun` callsite updated in Step 2 targets the agent run (other `.start(` hits are framer-motion controls — ignore).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/hooks/useAgentRun.ts "apps/web/src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "feat(auth): stream agent run over ponyfill with Bearer + projectId, drop client identity"
```

---

### Task 4: `/api/agent/run` — verify identity + enforce ownership, drop client identity

**Files:**
- Modify: `apps/web/src/app/api/agent/run/route.ts`

**Interfaces:**
- Consumes: `verifyRequestUser`, `AuthError` from `@/lib/auth/verify`.
- Behaviour: 401 when unauthenticated; 404 when the project doesn't exist **or** isn't owned by the caller (collapsed to avoid leaking existence); the minted `agentRuns` row stores the verified `userId`; response shape unchanged (`{ runId, eveSessionId }`).

- [ ] **Step 1: Update imports and `BodySchema`**

Add to the imports:

```typescript
import { verifyRequestUser, AuthError } from "@/lib/auth/verify";
```

Remove `userId` and `sessionId` from `BodySchema`:

```typescript
const BodySchema = z.object({
  projectId: z.string().min(1),
  brief: z.string(),
  kind: z.enum(["image", "video"]).optional(),
  aspectRatio: z.string().optional(),
  referencedAssetIds: z.array(z.string()).optional(),
});
```

- [ ] **Step 2: Verify the caller and enforce ownership**

At the top of the `try` in `POST`, before parsing the body, verify identity:

```typescript
  try {
    let user: { id: string; email: string | null };
    try {
      user = await verifyRequestUser(req);
    } catch (e) {
      if (e instanceof AuthError) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      throw e;
    }

    const parsed = BodySchema.safeParse(await req.json());
```

Replace the existence-only project query (the `db.query({ canvasProjects: { $: { where: { id: body.projectId } } } })` block) with an **ownership-scoped** query using the `"user.id"` dot-path, collapsing not-found and not-owned into 404:

```typescript
    // Existence + ownership in one indexed query: a project the caller does not
    // own returns nothing (404), which also avoids leaking that it exists.
    const projQ = await db.query({
      canvasProjects: {
        $: { where: { id: body.projectId, "user.id": user.id } },
      },
    });
    const project = projQ.canvasProjects?.[0];
    if (!project) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
```

- [ ] **Step 3: Store the verified identity on the run**

In the `billingUser` construction and the `agentRuns` insert, use `user.id` and drop `sessionId`:

```typescript
    const billingUser: BillingUser = { userId: user.id };
    const remainingCredits = await getUserCredits(billingUser);

    // Mint the opaque run token; store the verified identity + cap accounting.
    const runId = id();
    await db.transact([
      db.tx.agentRuns[id()].update({
        runId,
        userId: user.id,
        projectId: body.projectId,
        spentCredits: 0,
        status: "active",
        createdAt: new Date(),
      }),
    ]);
```

(Everything from the `message` construction onward is unchanged. The response stays `return NextResponse.json({ runId, eveSessionId });`.)

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: no NEW errors. (`agentRuns.sessionId` is optional in the schema, so omitting it is fine.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/agent/run/route.ts
git commit -m "feat(auth): require auth + project ownership on /api/agent/run"
```

---

### Task 5: `/api/agent/stream/[sessionId]` — verify identity + bind to owned project/session

**Files:**
- Modify: `apps/web/src/app/api/agent/stream/[sessionId]/route.ts`

**Interfaces:**
- Consumes: `verifyRequestUser`, `AuthError` from `@/lib/auth/verify`; `db` from `@/lib/instant-admin`.
- Behaviour: 401 (SSE error frame) when unauthenticated; 403 (SSE error frame) when the caller doesn't own a project whose stored `eveSessionState.sessionId` equals the requested `sessionId`. The existing sessionId regex/SSRF hardening stays.

- [ ] **Step 1: Update imports**

```typescript
import { NextRequest } from "next/server";
import { AGENT_URL, agentHeaders } from "@/lib/agent/eve-client";
import { db } from "@/lib/instant-admin";
import { verifyRequestUser, AuthError } from "@/lib/auth/verify";
```

- [ ] **Step 2: Add auth + ownership binding after the sessionId regex check**

Immediately after the existing `if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) { ... }` block and before the `startIndex` parse, add:

```typescript
  // Authenticate the caller.
  let user: { id: string; email: string | null };
  try {
    user = await verifyRequestUser(req);
  } catch (e) {
    if (e instanceof AuthError) {
      return new Response('event: error\ndata: "unauthorized"\n\n', {
        status: 401,
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    throw e;
  }

  // Bind the stream to a project the caller owns whose current eve session is
  // exactly this sessionId. projectId is client-supplied but fully verified:
  // the owner filter + the stored-session match together prove authorization.
  const projectId = req.nextUrl.searchParams.get("projectId") ?? "";
  const ownQ = await db.query({
    canvasProjects: { $: { where: { id: projectId, "user.id": user.id } } },
  });
  const project = ownQ.canvasProjects?.[0] as
    | { eveSessionState?: { sessionId?: string } }
    | undefined;
  if (!project || project.eveSessionState?.sessionId !== sessionId) {
    return new Response('event: error\ndata: "forbidden"\n\n', {
      status: 403,
      headers: { "Content-Type": "text/event-stream" },
    });
  }
```

(Everything from the `startIndex` parse onward — the upstream fetch, NDJSON→SSE re-emit, and headers — is unchanged.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: no NEW errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/api/agent/stream/[sessionId]/route.ts"
git commit -m "feat(auth): require auth + owned-session binding on /api/agent/stream"
```

---

### Task 6: tRPC generation procedures → `protectedProcedure`; derive identity from `ctx.user`

**Files:**
- Modify: `apps/web/src/server/trpc/init.ts` (add `protectedProcedure`)
- Modify: `apps/web/src/server/trpc/routers/_app.ts` (7 generation/utility procedures)
- Modify: `apps/web/src/components/canvas/StreamingVideo.tsx` (drop `userId`/`sessionId` from 2 subscription calls)

**Interfaces:**
- Produces: `protectedProcedure` — like `publicProcedure` but with `ctx.user: { id: string; email: string | null }` guaranteed; throws `UNAUTHORIZED` otherwise.
- Consumes (in `_app.ts`): `ctx.user.id` as `userId`; input schemas of the 7 procedures no longer contain `userId`/`sessionId`.

- [ ] **Step 1: Add `protectedProcedure`** — `apps/web/src/server/trpc/init.ts`

Append after `export const publicProcedure = t.procedure;`:

```typescript
import { TRPCError } from "@trpc/server";
import { verifyRequestUser, AuthError } from "@/lib/auth/verify";

export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.req) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  try {
    const user = await verifyRequestUser(ctx.req);
    return next({ ctx: { ...ctx, user } });
  } catch (e) {
    if (e instanceof AuthError) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    throw e;
  }
});
```

(Put the two new `import` lines at the top of the file with the others.)

- [ ] **Step 2: Drop identity from the StreamingVideo subscription callsites first** — `apps/web/src/components/canvas/StreamingVideo.tsx`

These fields are still optional server-side at this point, so removing them keeps typecheck green and avoids an excess-property error once Step 3 lands. Delete the two `userId: generation.userId,` / `sessionId: generation.sessionId,` pairs (around lines 72–73 and 131–132) from the `generateImageToVideo` and `generateTextToVideo` subscription option objects. Leave everything else (including the local `generation.*` fields) intact.

- [ ] **Step 3: Switch the 7 procedures to `protectedProcedure` and derive `userId` from `ctx.user`** — `apps/web/src/server/trpc/routers/_app.ts`

Update the import from `../init`:

```typescript
import { protectedProcedure, publicProcedure, router } from "../init";
```

For **each** of these 7 procedures — `transformVideo`, `generateImageToVideo`, `generateTextToVideo`, `removeBackground`, `isolateObject`, `generateTextToImage`, `generateImageStream`:

1. Change `publicProcedure` → `protectedProcedure`.
2. In the `.input(z.object({ ... }))`, **delete** the two lines:

   ```typescript
           // Billing context
           userId: z.string().optional(),
           sessionId: z.string().optional(),
   ```

   (In `generateImageToVideo` the object is wrapped in `.loose()` — keep the `.loose()`, just remove the two identity lines.)
3. Replace each `const billingUser: BillingUser = { userId: input.userId, sessionId: input.sessionId };` with:

   ```typescript
        const billingUser: BillingUser = { userId: ctx.user.id };
   ```

   `ctx` is already destructured in every one of these handlers (`{ input, ctx }` / `{ input, signal, ctx }`). Leave the existing `if (!useCustomApiKey && billingUser.userId)` charge guards as-is (now always truthy — billing.ts is not refactored).

- [ ] **Step 4: Typecheck**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: no NEW errors. `input.userId`/`input.sessionId` no longer exist on these procedures; confirm none remain:

Run: `cd /Users/vonweniger/GitHub/nusoma && grep -n "input.userId\|input.sessionId" apps/web/src/server/trpc/routers/_app.ts`
Expected: no matches.

- [ ] **Step 5: Run tests**

Run: `cd apps/web && bun test`
Expected: green (8/8 money-path + 6 auth).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/server/trpc/init.ts apps/web/src/server/trpc/routers/_app.ts apps/web/src/components/canvas/StreamingVideo.tsx
git commit -m "feat(auth): gate billed tRPC generation procedures with protectedProcedure"
```

---

### Task 7: `getUserCredits` → `protectedProcedure` (no input); update its client callsites

**Files:**
- Modify: `apps/web/src/server/trpc/routers/_app.ts` (`getUserCredits`)
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx` (~line 251)
- Modify: `apps/web/src/components/dashboard/AppLayout.tsx` (~line 109)

**Interfaces:**
- `getUserCredits` takes **no input** and returns `{ credits: number }` for the verified user. Client callsites pass no input and keep `enabled: !!user?.id` so logged-out users never fire it (credits stay 0).

- [ ] **Step 1: Make `getUserCredits` protected + input-less** — `apps/web/src/server/trpc/routers/_app.ts`

```typescript
  /**
   * Get the verified user's current credit balance from Polar
   */
  getUserCredits: protectedProcedure.query(async ({ ctx }) => {
    const credits = await getUserCredits({ userId: ctx.user.id });
    return { credits };
  }),
```

(Removes the `.input(z.object({ userId: z.string() }))`. The `getUserCredits` **import** from `@/server/billing` is unchanged — this is the imported billing function, distinct from the procedure.)

- [ ] **Step 2: Update the canvas callsite** — `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx` (~line 250)

```typescript
  const { data: creditsData, refetch: refetchCredits } = useQuery(
    trpc.getUserCredits.queryOptions(undefined, { enabled: !!user?.id }),
  );
```

- [ ] **Step 3: Update the AppLayout callsite** — `apps/web/src/components/dashboard/AppLayout.tsx` (~line 108)

```typescript
  const { data: creditsData } = useQuery(
    trpc.getUserCredits.queryOptions(undefined, { enabled: !!user?.id }),
  );
```

- [ ] **Step 4: Typecheck + confirm no stale callsites**

Run: `cd apps/web && bunx tsc --noEmit`
Expected: no NEW errors. If the tanstack adapter rejects `undefined` as the first arg for a void-input query, use `trpc.getUserCredits.queryOptions({ enabled: !!user?.id })` instead (single-arg form) — adjust both callsites identically.

Run: `cd /Users/vonweniger/GitHub/nusoma && grep -rn "getUserCredits.queryOptions" apps/web/src --include="*.tsx" | grep -v node_modules`
Expected: exactly the two callsites above, neither passing `userId`.

- [ ] **Step 5: Confirm no server-side (RSC) caller invokes a now-protected procedure without a token**

Run: `cd /Users/vonweniger/GitHub/nusoma && grep -rn "getUserCredits\|generateTextToImage\|generateImageStream\|transformVideo\|generateImageToVideo\|generateTextToVideo\|removeBackground\|isolateObject" apps/web/src/trpc/server.tsx apps/web/src/app --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v "queryOptions\|subscriptionOptions\|mutationOptions\|routers/_app\|api/agent\|api/internal"`
Expected: no server-component caller of these procedures (all invocations go through client hooks). If any RSC caller is found, STOP and escalate — it would 401 at runtime.

- [ ] **Step 6: Run tests**

Run: `cd apps/web && bun test`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/server/trpc/routers/_app.ts "apps/web/src/app/(authenticated)/canvas/[id]/page.tsx" apps/web/src/components/dashboard/AppLayout.tsx
git commit -m "feat(auth): require auth for getUserCredits and derive user from context"
```

---

## Final verification (before finishing the branch)

- [ ] `cd apps/web && bun test` → all green (8 money-path + 6 auth).
- [ ] `cd apps/web && bunx tsc --noEmit` → no NEW errors vs. the branch point (`git stash` is not needed; compare against the ~13 pre-existing errors documented on `feat/monorepo`).
- [ ] `cd apps/web && bunx eslint src/lib/auth src/hooks/useAgentRun.ts src/app/core-providers.tsx src/providers/auth-provider.tsx src/server/trpc` → clean (or run `cd /Users/vonweniger/GitHub/nusoma && bun run lint`).
- [ ] Grep sweep — no billed path reads client identity:
  - `grep -rn "input.userId\|input.sessionId" apps/web/src/server/trpc` → none.
  - `grep -rn "body.userId\|body.sessionId" apps/web/src/app/api/agent` → none.
- [ ] Manual/live pass (documented, not automated — requires a running stack + real login): real login → generation succeeds and bills the logged-in user; a POST to `/api/agent/run` with a spoofed body (no/other identity) → 401; `/api/agent/run` for a project you don't own → 404; an `EventSource` to `/api/agent/stream/<sid>` without a token or for a non-owned project → 401/403; a logged-out user sees 0 credits with no crash.

## Self-review notes (addressed in this plan)

- **SSE can't send headers** → resolved with the `extended-eventsource` ponyfill for both tRPC subscriptions and `useAgentRun`; no credential in any URL.
- **Dropping optional vs required input fields** → generation procedures' identity fields are optional (client callsites cleaned before server removal, Task 6 Steps 2–3); `getUserCredits`' `userId` is required (server + both callsites changed together, Task 7).
- **Ponyfill auto-retry vs manual cursor reconnect** → `disableRetry: true` in `useAgentRun`; tRPC's subscription link keeps its default retry (relies on `tracked()` ids for resumption).
- **First-paint token race** → token is set during the auth provider's render (not an effect), so it's populated before child effects fire.
- **Internal generate route** → unchanged; it bills from the stored `run.userId`, which is now the verified user (Task 4).
