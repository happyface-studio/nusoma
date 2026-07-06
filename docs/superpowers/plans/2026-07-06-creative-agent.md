# Creative Agent (eve + fal MCP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace nusoma's fixed-model asset generation with an eve agent that picks fal models dynamically per prompt, runs them through nusoma's existing billing/persistence, and streams its reasoning to a terminal-style log overlay.

**Architecture:** eve reasons, nusoma executes. A separate eve project under `agent/` plans and selects models (fal MCP is discovery-only via `tools.allow`), then calls back into two nusoma internal endpoints protected by a service secret. nusoma owns money (Polar) and data (InstantDB admin). The prompt bar triggers a run; a new SSE route re-emits eve's NDJSON event stream to a canvas overlay.

**Tech Stack:** Next.js 16 / React 19, tRPC v11 (existing gen path, untouched), `@fal-ai/client`, `@instantdb/admin` + `@instantdb/react`, Polar (`@polar-sh/sdk`), zod v4, bun (+ `bun test`), eve (`eve`, `eve/tools`, `eve/connections`, `eve/client`).

## Global Constraints

- Package manager: **bun**. Run scripts with `bun run <script>`; unit tests with `bun test`.
- Quality gates (no test runner exists): `bun run typecheck`, `bun run lint`. New pure-logic gets `bun test` files (`*.test.ts`).
- Billing lives in **`src/server/billing.ts`** (Polar meter `appConfig.billing.meterSlug` = `"₦ credit usage"`). NEVER use `src/lib/billing.ts` (different event name `"fal_usage"`).
- **Money model = check → generate → charge-on-success** (Polar is an append-only meter; there is NO reserve/refund). Safety comes from: (a) `checkCreditsForGeneration` before running, (b) content-hash **idempotency** so a retried tool call never double-charges, (c) a **per-run credit cap** enforced server-side. This deliberately deviates from the spec's "reserve-then-settle" because the codebase has no reservation primitive — same safety, faithful to Polar. Residual: two _concurrent_ generations in one run can each pass the check before either charges (pre-existing app behavior; the per-run cap bounds worst-case exposure).
- **Auth = trust-the-input** (no server token verification exists anywhere). Internal endpoints (`/api/internal/*`) are gated ONLY by the `x-nusoma-secret` header. `/api/agent/run` trusts client-supplied `userId`/`sessionId` exactly like the existing tRPC procedures do.
- Pricing already handles arbitrary endpoints: `estimateFalCost(endpoint, quantity)` calls fal's live pricing API. Do not build a pricing table.
- Cost math (existing, do not reinvent): `credits = max(minimumCharge, ceil((falCost * (1+marginPercentage)) / creditToUsdRate))`.
- The model NEVER receives billing identity. `/api/agent/run` mints an opaque `runId`; the `generate` tool echoes only `runId`; nusoma resolves `userId`/`projectId` from the `agentRuns` row.

## Env vars (add to `.env` and deploy configs)

- nusoma: `AGENT_URL` (eve base URL, e.g. `http://127.0.0.1:2000` in dev), `NUSOMA_SERVICE_SECRET` (shared secret).
- eve (`agent/.env`): `FAL_KEY` (same as nusoma), `NUSOMA_INTERNAL_URL` (nusoma base, e.g. `http://127.0.0.1:3000`), `NUSOMA_SERVICE_SECRET` (same value), plus AI Gateway auth (OIDC on Vercel; locally an `AI_GATEWAY_API_KEY` per eve's generated README).

---

## Task 1: eve project scaffold + fal discovery connection

**Files:**

- Create: `agent/` (scaffolded), `agent/agent.ts`, `agent/instructions.md`, `agent/connections/fal.ts`
- Create: `.gitignore` entry for `agent/.eve/` and `agent/node_modules/`

**Interfaces:**

- Produces: a runnable eve agent on `http://127.0.0.1:2000` that can reason and discover fal models via `fal__search_models`. No generation yet.

- [ ] **Step 1: Scaffold the eve project**

Run from repo root:

```bash
npx eve@latest init agent
```

When prompted, accept defaults. This creates `agent/` with its own `package.json`, `agent/agent.ts`, `agent/instructions.md`, `agent/channels/eve.ts`.

- [ ] **Step 2: Pin the agent model**

Overwrite `agent/agent.ts`:

```ts
import { defineAgent } from "eve";

export default defineAgent({
  model: "anthropic/claude-sonnet-5",
});
```

- [ ] **Step 3: Add the fal MCP connection (discovery-only)**

Create `agent/connections/fal.ts`:

```ts
import { defineMcpClientConnection } from "eve/connections";

// Discovery only. Execution goes through nusoma's `generate` tool, never fal's run/submit.
export default defineMcpClientConnection({
  url: "https://mcp.fal.ai/mcp",
  description:
    "fal.ai model catalog. Use to search models, read their input schemas, and check pricing before generating.",
  auth: {
    getToken: async () => ({ token: process.env.FAL_KEY! }),
  },
  tools: {
    allow: [
      "search_models",
      "get_model_schema",
      "check_pricing",
      "recommend_models",
    ],
  },
});
```

- [ ] **Step 4: Verify exact fal tool names, correct the allowlist if needed**

Run `agent/` locally:

```bash
cd agent && cp .env.example .env   # then set FAL_KEY and AI Gateway auth per the generated README
bun run dev   # or: npx eve dev --port 2000
```

In a second shell, start a session that forces discovery:

```bash
curl -s -X POST http://127.0.0.1:2000/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"Use connection_search to list the fal connection tools available to you, then print their exact names."}'
```

Read back the stream (`curl http://127.0.0.1:2000/eve/v1/session/<id>/stream`). Expected: the agent reports fal tool names. If any allowlisted name differs (e.g. `get_schema` vs `get_model_schema`), fix `tools.allow` in `agent/connections/fal.ts` to match. This is the one place fal's exact names matter.

- [ ] **Step 5: Write the creative-director instructions**

Overwrite `agent/instructions.md`:

```md
You are nusoma's creative director. Every run turns a user's brief into media on their canvas.

## Hard contract

- Every run MUST end with at least one successful `generate` call. A run that ends with only
  text is a FAILURE, unless it was blocked by `insufficient_credits` or `cap_exceeded` — in
  that case, explain the block clearly and stop.
- Never call fal's run/submit/upload tools. You only have fal's discovery tools
  (`fal__search_models`, `fal__get_model_schema`, `fal__check_pricing`, `fal__recommend_models`).
  The ONLY way to produce media is the nusoma `generate` tool.

## Every request carries a `runId` in this message

- Pass that exact `runId` to every `generate` call. Do not invent or reuse a different one.

## How to work

1. If the brief references existing canvas assets, call `read_project` first to understand them.
2. Decide intent: image or video; text-to-X, image-to-X, or a chain (e.g. generate a still, then
   animate it).
3. Use `fal__search_models` / `fal__recommend_models` to find candidates, `fal__get_model_schema`
   to learn a model's inputs, and `fal__check_pricing` to respect the budget in your context.
4. Call `generate` with the chosen fal `endpoint`, an `input` object matching that model's schema,
   and `kind: "image" | "video"`. Include `referencedAssetIds` when using existing assets.
5. Reason out loud — your reasoning is shown to the user in a live log.

Prefer the cheapest model that meets the brief's quality bar. When unsure between two models,
pick the one with the clearer schema and lower price.
```

**Skill loaded on demand** — create `agent/skills/selecting-a-model.md`:

```md
# Selecting a fal model

- Text-to-image, general: search "text to image", favor flux-family for quality, cheaper SDXL-class for drafts.
- Editing an existing image: image-to-image / inpaint models; pass the source via `referencedAssetIds` and the model's `image_url(s)` input.
- Video from a still: image-to-video models (e.g. kling, ltx). Generate or reuse a still first, then animate.
- Text-to-video: only when no source image is implied.
- LoRA/style: models whose schema accepts a `loras` array.
- Always `fal__get_model_schema` before `generate` — input keys vary per model.
- Budget: `fal__check_pricing` the finalists; stay within the credits stated in your context.
```

- [ ] **Step 6: Commit**

```bash
printf '\nagent/.eve/\nagent/node_modules/\n' >> .gitignore
git add agent .gitignore
git commit -m "feat(agent): scaffold eve agent with fal discovery connection"
```

---

## Task 2: nusoma schema — agentRuns, agentGenerations, project session cursor

**Files:**

- Modify: `src/instant.schema.ts` (add two entities + one field)

**Interfaces:**

- Produces: entities `agentRuns { runId, userId?, sessionId?, projectId, spentCredits, status, createdAt }`, `agentGenerations { idempotencyKey, runId, endpoint, status, assetId?, credits?, cost?, createdAt }`, and `canvasProjects.eveSessionState: json`.

- [ ] **Step 1: Add the entities and field**

In `src/instant.schema.ts`, inside `entities: { ... }`, add the field to `canvasProjects` and the two new entities:

```ts
    canvasProjects: i.entity({
      name: i.string().optional(),
      backgroundColor: i.string().optional(),
      viewportX: i.number().optional(),
      viewportY: i.number().optional(),
      viewportScale: i.number().optional(),
      lastModified: i.date().indexed().optional(),
      sessionId: i.string().optional().indexed(),
      eveSessionState: i.json().optional(), // { continuationToken?, sessionId?, streamIndex }
    }),
    agentRuns: i.entity({
      runId: i.string().unique().indexed(),
      userId: i.string().optional().indexed(),
      sessionId: i.string().optional().indexed(),
      projectId: i.string().indexed(),
      spentCredits: i.number(),
      status: i.string().indexed(), // 'active' | 'done' | 'failed'
      createdAt: i.date().indexed(),
    }),
    agentGenerations: i.entity({
      idempotencyKey: i.string().unique().indexed(),
      runId: i.string().indexed(),
      endpoint: i.string(),
      status: i.string().indexed(), // 'running' | 'completed' | 'failed'
      assetId: i.string().optional(),
      credits: i.number().optional(),
      cost: i.number().optional(),
      createdAt: i.date().indexed(),
    }),
```

- [ ] **Step 2: Push the schema and regenerate types**

```bash
bun run db:push
bun run typecheck
```

Expected: `instant-cli push` reports the new entities/attrs created; `typecheck` passes.

- [ ] **Step 3: Commit**

```bash
git add src/instant.schema.ts
git commit -m "feat(schema): add agentRuns, agentGenerations, project eveSessionState"
```

---

## Task 3: money-path pure logic + unit tests

**Files:**

- Create: `src/lib/agent/generate-core.ts`
- Create: `src/lib/agent/generate-core.test.ts`

**Interfaces:**

- Produces:
  - `extractMediaUrl(kind: 'image' | 'video', falResult: unknown): { url: string; durationSeconds?: number }` — throws `Error('no media in fal result')` if absent.
  - `idempotencyKeyFor(runId: string, endpoint: string, input: unknown): string`
  - `capExceeded(spentCredits: number, nextCredits: number, cap: number): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agent/generate-core.test.ts`:

```ts
import { test, expect } from "bun:test";
import {
  extractMediaUrl,
  idempotencyKeyFor,
  capExceeded,
} from "./generate-core";

test("extractMediaUrl reads fal image shape", () => {
  const r = { data: { images: [{ url: "https://fal/img.png" }] } };
  expect(extractMediaUrl("image", r)).toEqual({ url: "https://fal/img.png" });
});

test("extractMediaUrl reads fal video shape with duration", () => {
  const r = { data: { video: { url: "https://fal/v.mp4" }, duration: 5 } };
  expect(extractMediaUrl("video", r)).toEqual({
    url: "https://fal/v.mp4",
    durationSeconds: 5,
  });
});

test("extractMediaUrl throws when empty", () => {
  expect(() => extractMediaUrl("image", { data: {} })).toThrow(
    "no media in fal result",
  );
});

test("idempotencyKeyFor is stable for same args and differs on input", () => {
  const a = idempotencyKeyFor("run1", "fal-ai/x", { prompt: "cat" });
  const b = idempotencyKeyFor("run1", "fal-ai/x", { prompt: "cat" });
  const c = idempotencyKeyFor("run1", "fal-ai/x", { prompt: "dog" });
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

test("capExceeded is true only when spend would exceed cap", () => {
  expect(capExceeded(40, 20, 50)).toBe(true);
  expect(capExceeded(40, 10, 50)).toBe(false);
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
bun test src/lib/agent/generate-core.test.ts
```

Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Implement**

Create `src/lib/agent/generate-core.ts`:

```ts
import { createHash } from "node:crypto";

export function extractMediaUrl(
  kind: "image" | "video",
  falResult: unknown,
): { url: string; durationSeconds?: number } {
  const data = (falResult as any)?.data ?? falResult;
  if (kind === "image") {
    const url = data?.images?.[0]?.url ?? data?.image?.url;
    if (typeof url === "string") return { url };
  } else {
    const url = data?.video?.url ?? data?.videos?.[0]?.url;
    if (typeof url === "string") {
      const durationSeconds =
        typeof data?.duration === "number" ? data.duration : undefined;
      return { url, durationSeconds };
    }
  }
  throw new Error("no media in fal result");
}

export function idempotencyKeyFor(
  runId: string,
  endpoint: string,
  input: unknown,
): string {
  const canonical = JSON.stringify({ runId, endpoint, input });
  return createHash("sha256").update(canonical).digest("hex");
}

export function capExceeded(
  spentCredits: number,
  nextCredits: number,
  cap: number,
): boolean {
  return spentCredits + nextCredits > cap;
}
```

- [ ] **Step 4: Run, verify pass**

```bash
bun test src/lib/agent/generate-core.test.ts
```

Expected: PASS (5 tests). Then `bun run typecheck` passes.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/generate-core.ts src/lib/agent/generate-core.test.ts
git commit -m "feat(agent): money-path pure logic (url extract, idempotency, cap)"
```

---

## Task 4: add per-run cap config constant

**Files:**

- Modify: `src/lib/config.ts` (add `agent` section)

**Interfaces:**

- Produces: `appConfig.agent.runCreditCap: number`

- [ ] **Step 1: Add the constant**

In `src/lib/config.ts`, add to the `appConfig` object (after the `fal` section):

```ts
  agent: {
    runCreditCap: 50, // max credits a single agent run may spend; server-enforced
  },
```

- [ ] **Step 2: Verify + commit**

```bash
bun run typecheck
git add src/lib/config.ts
git commit -m "feat(config): agent.runCreditCap"
```

---

## Task 5: `POST /api/internal/generate` — the execution + money + persistence path

**Files:**

- Create: `src/lib/agent/persist-asset.ts`
- Create: `src/app/api/internal/generate/route.ts`

**Interfaces:**

- Consumes: `extractMediaUrl`, `idempotencyKeyFor`, `capExceeded` (Task 3); `estimateFalCost` (`src/lib/fal-pricing.ts`), `checkCreditsForGeneration`, `processGenerationCharge`, `BillingUser` (`src/server/billing.ts`); `appConfig` (`src/lib/config.ts`); admin `db` (`src/lib/instant-admin.ts`).
- Produces: `POST /api/internal/generate` returning
  `{ assetId, url, cost, credits, remainingCredits }` or `{ error: 'insufficient_credits'|'cap_exceeded'|'generation_failed'|'unauthorized'|'unknown_run', ... }`.

- [ ] **Step 1: Server-side asset persistence helper**

Create `src/lib/agent/persist-asset.ts`:

```ts
import { db } from "@/lib/instant-admin";
import { id } from "@instantdb/admin";

// Downloads a fal media URL and stores it in InstantDB via the ADMIN client,
// creating a canvasAssets row linked to the file, the user, and lineage.
export async function persistAgentAsset(opts: {
  url: string;
  kind: "image" | "video";
  prompt: string;
  creditsConsumed: number;
  durationSeconds?: number;
  userId?: string;
  sessionId?: string;
  referencedAssetIds?: string[];
}): Promise<string> {
  const assetId = id();
  const res = await fetch(opts.url);
  if (!res.ok) throw new Error(`fetch media failed: ${res.status}`);
  const contentType =
    res.headers.get("content-type") ??
    (opts.kind === "image" ? "image/png" : "video/mp4");
  const buffer = Buffer.from(await res.arrayBuffer());

  const owner = opts.userId ?? opts.sessionId ?? "anon";
  const path = `canvas-${opts.kind}s/${owner}/${assetId}`;
  const { data } = await db.storage.uploadFile(path, buffer, { contentType });

  const tx = db.tx.canvasAssets[assetId]
    .update({
      type: opts.kind,
      createdAt: new Date(),
      prompt: opts.prompt,
      creditsConsumed: opts.creditsConsumed,
      ...(opts.durationSeconds ? { duration: opts.durationSeconds } : {}),
    })
    .link({ file: data.id, ...(opts.userId ? { user: opts.userId } : {}) });

  const txs = [tx];
  for (const refId of opts.referencedAssetIds ?? []) {
    txs.push(db.tx.canvasAssets[assetId].link({ referencedAssets: refId }));
  }
  await db.transact(txs);
  return assetId;
}
```

> Note: confirm the admin storage return shape on first run — the plan assumes `{ data: { id } }` per InstantDB admin docs. If it returns the id at top level, adjust `data.id`.

- [ ] **Step 2: The route handler**

Create `src/app/api/internal/generate/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createFalClient } from "@fal-ai/client";
import { db } from "@/lib/instant-admin";
import { id } from "@instantdb/admin";
import { appConfig } from "@/lib/config";
import { estimateFalCost } from "@/lib/fal-pricing";
import {
  checkCreditsForGeneration,
  processGenerationCharge,
  type BillingUser,
} from "@/server/billing";
import {
  extractMediaUrl,
  idempotencyKeyFor,
  capExceeded,
} from "@/lib/agent/generate-core";
import { persistAgentAsset } from "@/lib/agent/persist-asset";

const fal = createFalClient({
  credentials: () => process.env.FAL_KEY as string,
});

export async function POST(req: NextRequest) {
  if (
    req.headers.get("x-nusoma-secret") !== process.env.NUSOMA_SERVICE_SECRET
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { runId, endpoint, input, kind, prompt, referencedAssetIds } = body as {
    runId: string;
    endpoint: string;
    input: Record<string, unknown>;
    kind: "image" | "video";
    prompt?: string;
    referencedAssetIds?: string[];
  };

  // Resolve identity + run from the opaque runId (never trust model-supplied identity).
  const runQ = await db.query({ agentRuns: { $: { where: { runId } } } });
  const run = runQ.agentRuns?.[0];
  if (!run) return NextResponse.json({ error: "unknown_run" }, { status: 404 });
  const billingUser: BillingUser = {
    userId: run.userId,
    sessionId: run.sessionId,
  };

  // Idempotency: same (runId, endpoint, input) → return prior result, no re-charge.
  const key = idempotencyKeyFor(runId, endpoint, input);
  const priorQ = await db.query({
    agentGenerations: { $: { where: { idempotencyKey: key } } },
  });
  const prior = priorQ.agentGenerations?.[0];
  if (prior?.status === "completed") {
    return NextResponse.json({
      assetId: prior.assetId,
      url: null,
      cost: prior.cost,
      credits: prior.credits,
      remainingCredits: null,
      idempotent: true,
    });
  }

  // Price + cap + credit checks.
  const estimate = await estimateFalCost(endpoint, 1);
  if (
    capExceeded(
      run.spentCredits,
      estimate.totalCredits,
      appConfig.agent.runCreditCap,
    )
  ) {
    return NextResponse.json(
      {
        error: "cap_exceeded",
        cap: appConfig.agent.runCreditCap,
        spent: run.spentCredits,
      },
      { status: 402 },
    );
  }
  const check = await checkCreditsForGeneration(
    billingUser,
    endpoint,
    1,
    false,
  );
  if (!check.canProceed) {
    return NextResponse.json(
      {
        error: "insufficient_credits",
        shortfall: check.shortfall,
        currentCredits: check.currentCredits,
      },
      { status: 402 },
    );
  }

  // Reuse the prior row on retry (a failed prior would otherwise collide on the unique
  // idempotencyKey); else create a fresh one.
  const genId = prior?.id ?? id();
  await db.transact([
    db.tx.agentGenerations[genId].update({
      idempotencyKey: key,
      runId,
      endpoint,
      status: "running",
      createdAt: new Date(),
    }),
  ]);

  // Run fal (one retry).
  let result: unknown;
  try {
    result = await fal.subscribe(endpoint, { input, logs: true });
  } catch {
    try {
      result = await fal.subscribe(endpoint, { input, logs: true });
    } catch (e) {
      await db.transact([
        db.tx.agentGenerations[genId].update({ status: "failed" }),
      ]);
      return NextResponse.json(
        { error: "generation_failed", detail: String(e) },
        { status: 502 },
      );
    }
  }

  let media: { url: string; durationSeconds?: number };
  try {
    media = extractMediaUrl(kind, result);
  } catch (e) {
    await db.transact([
      db.tx.agentGenerations[genId].update({ status: "failed" }),
    ]);
    return NextResponse.json(
      { error: "generation_failed", detail: String(e) },
      { status: 502 },
    );
  }

  // Persist server-side, then charge (asset exists even if charge later fails).
  const assetId = await persistAgentAsset({
    url: media.url,
    kind,
    prompt: prompt ?? "",
    creditsConsumed: estimate.totalCredits,
    durationSeconds: media.durationSeconds,
    userId: run.userId,
    sessionId: run.sessionId,
    referencedAssetIds,
  });

  const charge = await processGenerationCharge(billingUser, estimate, {
    generation_type: "agent",
    model: endpoint,
    run_id: runId,
  });

  await db.transact([
    db.tx.agentGenerations[genId].update({
      status: "completed",
      assetId,
      credits: charge.creditsCharged ?? estimate.totalCredits,
      cost: estimate.totalCostUsd,
    }),
    db.tx.agentRuns[run.id].update({
      spentCredits: run.spentCredits + estimate.totalCredits,
    }),
  ]);

  return NextResponse.json({
    assetId,
    url: media.url,
    cost: estimate.totalCostUsd,
    credits: charge.creditsCharged ?? estimate.totalCredits,
    remainingCredits: charge.newBalance,
  });
}
```

- [ ] **Step 3: Verify (manual, hits live fal + Polar + Instant)**

Seed a run row and call the endpoint (replace ids + a real project/user):

```bash
# create an agentRuns row via instant, or reuse one created by Task 6 later.
curl -s -X POST http://127.0.0.1:3000/api/internal/generate \
  -H 'content-type: application/json' -H "x-nusoma-secret: $NUSOMA_SERVICE_SECRET" \
  -d '{"runId":"<seeded-run>","endpoint":"fal-ai/flux-2-pro","input":{"prompt":"a red cap on a table"},"kind":"image","prompt":"a red cap on a table"}'
```

Expected: JSON `{ assetId, url, cost, credits, remainingCredits }`. Re-run the identical curl → expect `{ idempotent: true }` and Polar balance unchanged. Bad secret → 401.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/persist-asset.ts src/app/api/internal/generate/route.ts
git commit -m "feat(api): internal generate — price, cap, run fal, persist, charge"
```

---

## Task 6: `POST /api/internal/project` — project knowledge for the agent

**Files:**

- Create: `src/app/api/internal/project/route.ts`

**Interfaces:**

- Consumes: admin `db`.
- Produces: `POST /api/internal/project` `{ projectId }` → `{ project, assets: [{ id, type, prompt, referencedAssetIds }] }`.

- [ ] **Step 1: Implement**

Create `src/app/api/internal/project/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/instant-admin";

export async function POST(req: NextRequest) {
  if (
    req.headers.get("x-nusoma-secret") !== process.env.NUSOMA_SERVICE_SECRET
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { projectId } = (await req.json()) as { projectId: string };

  const q = await db.query({
    canvasProjects: {
      $: { where: { id: projectId } },
      elements: { asset: { referencedAssets: {} } },
    },
  });
  const project = q.canvasProjects?.[0];
  if (!project)
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const assets: {
    id: string;
    type?: string;
    prompt?: string;
    referencedAssetIds: string[];
  }[] = [];
  for (const el of (project as any).elements ?? []) {
    const a = el.asset?.[0] ?? el.asset;
    if (a?.id) {
      assets.push({
        id: a.id,
        type: a.type,
        prompt: a.prompt,
        referencedAssetIds: (a.referencedAssets ?? []).map((r: any) => r.id),
      });
    }
  }
  return NextResponse.json({
    project: { id: project.id, name: (project as any).name },
    assets,
  });
}
```

> Note: confirm the `canvasProjects → elements → asset` link labels against `src/instant.schema.ts` (`canvasProjectElements`, `canvasElementAsset`). Adjust nested keys if the labels differ.

- [ ] **Step 2: Verify**

```bash
curl -s -X POST http://127.0.0.1:3000/api/internal/project \
  -H 'content-type: application/json' -H "x-nusoma-secret: $NUSOMA_SERVICE_SECRET" \
  -d '{"projectId":"<a-real-project-id>"}'
```

Expected: `{ project, assets: [...] }`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/internal/project/route.ts
git commit -m "feat(api): internal project read for agent knowledge"
```

---

## Task 7: `POST /api/agent/run` — mint run, start/continue eve session

**Files:**

- Create: `src/lib/agent/eve-client.ts`
- Create: `src/app/api/agent/run/route.ts`

**Interfaces:**

- Consumes: `eve/client` `Client`; admin `db`; `getUserCredits` (`src/server/billing.ts`).
- Produces: `POST /api/agent/run` `{ projectId, userId?, sessionId?, brief, kind?, aspectRatio?, referencedAssetIds? }` → `{ runId, eveSessionId }`.

- [ ] **Step 1: Shared eve client**

Create `src/lib/agent/eve-client.ts`:

```ts
import { Client } from "eve/client";

export const eveClient = new Client({ host: process.env.AGENT_URL! });

export type EveSessionState = {
  continuationToken?: string;
  sessionId?: string;
  streamIndex: number;
};
```

- [ ] **Step 2: The run route**

Create `src/app/api/agent/run/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/instant-admin";
import { id } from "@instantdb/admin";
import { getUserCredits, type BillingUser } from "@/server/billing";
import { eveClient, type EveSessionState } from "@/lib/agent/eve-client";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    projectId: string;
    userId?: string;
    sessionId?: string;
    brief: string;
    kind?: "image" | "video";
    aspectRatio?: string;
    referencedAssetIds?: string[];
  };

  const billingUser: BillingUser = {
    userId: body.userId,
    sessionId: body.sessionId,
  };
  const remainingCredits = await getUserCredits(billingUser);

  // Mint the opaque run token; store identity + cap accounting.
  const runId = id();
  await db.transact([
    db.tx.agentRuns[id()].update({
      runId,
      userId: body.userId,
      sessionId: body.sessionId,
      projectId: body.projectId,
      spentCredits: 0,
      status: "active",
      createdAt: new Date(),
    }),
  ]);

  // Resume this project's durable session, or start a fresh one.
  const projQ = await db.query({
    canvasProjects: { $: { where: { id: body.projectId } } },
  });
  const saved = projQ.canvasProjects?.[0]?.eveSessionState as
    EveSessionState | undefined;
  const session = eveClient.session(saved ?? undefined);

  const message = [
    `runId: ${runId}`,
    `projectId: ${body.projectId}`,
    `remainingCredits: ${remainingCredits}`,
    body.kind ? `preferredKind: ${body.kind}` : "",
    body.aspectRatio ? `aspectRatio: ${body.aspectRatio}` : "",
    body.referencedAssetIds?.length
      ? `referencedAssetIds: ${body.referencedAssetIds.join(",")}`
      : "",
    "",
    `Brief: ${body.brief}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await session.send(message);
  void response; // fire-and-forget; the durable turn runs on the eve deployment

  const state = session.state as EveSessionState;
  await db.transact([
    db.tx.canvasProjects[body.projectId].update({ eveSessionState: state }),
  ]);

  return NextResponse.json({ runId, eveSessionId: state.sessionId });
}
```

> **Integration risk to verify first:** confirm the durable turn continues on the eve deployment after this handler returns without draining `response`. If eve requires the stream to be consumed to progress, the SSE route in Task 8 becomes the driver (it attaches to the same session) — which it does anyway, so end-to-end still works; only latency-to-first-event changes.

- [ ] **Step 3: Verify**

```bash
curl -s -X POST http://127.0.0.1:3000/api/agent/run \
  -H 'content-type: application/json' \
  -d '{"projectId":"<real-project>","userId":"<real-user>","brief":"a red baseball cap product shot on a wooden table","kind":"image"}'
```

Expected: `{ runId, eveSessionId }`; an `agentRuns` row exists; `canvasProjects.eveSessionState` populated.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/eve-client.ts src/app/api/agent/run/route.ts
git commit -m "feat(api): agent run — mint runId, start/continue eve session"
```

---

## Task 8: eve `generate` + `read_project` tools

**Files:**

- Create: `agent/tools/generate.ts`, `agent/tools/read_project.ts`

**Interfaces:**

- Consumes: nusoma `/api/internal/generate`, `/api/internal/project` (Tasks 5, 6).
- Produces: model-callable tools `generate` and `read_project`.

- [ ] **Step 1: `generate` tool**

Create `agent/tools/generate.ts`:

```ts
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Generate one media asset on the user's canvas by running a fal model. This is the only way to produce output. Pass the runId from your context.",
  inputSchema: z.object({
    runId: z
      .string()
      .describe("The runId given in your context. Do not invent one."),
    endpoint: z.string().describe('fal endpoint, e.g. "fal-ai/flux-2-pro"'),
    input: z
      .record(z.string(), z.any())
      .describe("Model input matching the model's schema"),
    kind: z.enum(["image", "video"]),
    prompt: z
      .string()
      .describe("The human-readable prompt, stored with the asset"),
    referencedAssetIds: z.array(z.string()).optional(),
  }),
  async execute(input) {
    const res = await fetch(
      `${process.env.NUSOMA_INTERNAL_URL}/api/internal/generate`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-nusoma-secret": process.env.NUSOMA_SERVICE_SECRET!,
        },
        body: JSON.stringify(input),
      },
    );
    return await res.json();
  },
});
```

- [ ] **Step 2: `read_project` tool**

Create `agent/tools/read_project.ts`:

```ts
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description:
    "Read the current canvas project: its assets, their prompts, and lineage. Use before generating if the brief refers to existing assets.",
  inputSchema: z.object({
    projectId: z.string().describe("The projectId given in your context."),
  }),
  async execute(input) {
    const res = await fetch(
      `${process.env.NUSOMA_INTERNAL_URL}/api/internal/project`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-nusoma-secret": process.env.NUSOMA_SERVICE_SECRET!,
        },
        body: JSON.stringify(input),
      },
    );
    return await res.json();
  },
});
```

- [ ] **Step 3: End-to-end verify (both servers running)**

With nusoma on :3000 and `cd agent && bun run dev` on :2000, and `agent/.env` carrying `NUSOMA_INTERNAL_URL=http://127.0.0.1:3000` + `NUSOMA_SERVICE_SECRET`:

```bash
# use the runId + eveSessionId returned by a fresh /api/agent/run call, then watch:
curl -N http://127.0.0.1:2000/eve/v1/session/<eveSessionId>/stream
```

Expected: `actions.requested` for `generate`, then `action.result` with `{ assetId, ... }`, and a new `canvasAssets` row exists in InstantDB.

- [ ] **Step 4: Commit**

```bash
git add agent/tools/generate.ts agent/tools/read_project.ts
git commit -m "feat(agent): generate + read_project tools calling nusoma"
```

---

## Task 9: `GET /api/agent/stream/[sessionId]` — SSE proxy of eve events

**Files:**

- Create: `src/app/api/agent/stream/[sessionId]/route.ts`

**Interfaces:**

- Consumes: `eveClient` (Task 7).
- Produces: SSE stream re-emitting eve NDJSON events; accepts `?startIndex=` for reconnect.

- [ ] **Step 1: Implement**

Create `src/app/api/agent/stream/[sessionId]/route.ts`:

```ts
import { NextRequest } from "next/server";
import { eveClient } from "@/lib/agent/eve-client";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const startIndex = Number(req.nextUrl.searchParams.get("startIndex") ?? "0");
  const session = eveClient.session({ sessionId, streamIndex: startIndex });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of session.stream({ startIndex })) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
          if (
            event.type === "session.completed" ||
            event.type === "session.failed"
          )
            break;
        }
      } catch (e) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify(String(e))}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2: Verify**

```bash
curl -N "http://127.0.0.1:3000/api/agent/stream/<eveSessionId>?startIndex=0"
```

Expected: `data: {"type":"reasoning.appended",...}` lines, ending at `session.completed`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agent/stream/
git commit -m "feat(api): SSE proxy of eve session stream"
```

---

## Task 10: terminal log overlay component

**Files:**

- Create: `src/components/canvas/AgentLogOverlay.tsx`
- Create: `src/hooks/useAgentRun.ts`

**Interfaces:**

- Consumes: `/api/agent/run`, `/api/agent/stream/[sessionId]`.
- Produces: `useAgentRun()` → `{ start(args), events, status }`; `<AgentLogOverlay>` rendering events bottom-right.

- [ ] **Step 1: Run hook (EventSource + reconnect via startIndex)**

Create `src/hooks/useAgentRun.ts`:

```ts
import { useCallback, useRef, useState } from "react";

export type AgentEvent = { type: string; data?: any };

export function useAgentRun() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "failed">(
    "idle",
  );
  const indexRef = useRef(0);

  const start = useCallback(
    async (args: {
      projectId: string;
      userId?: string;
      sessionId?: string;
      brief: string;
      kind?: "image" | "video";
      aspectRatio?: string;
      referencedAssetIds?: string[];
    }) => {
      setEvents([]);
      setStatus("running");
      indexRef.current = 0;
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const { eveSessionId } = await res.json();

      const open = () => {
        const es = new EventSource(
          `/api/agent/stream/${eveSessionId}?startIndex=${indexRef.current}`,
        );
        es.onmessage = (m) => {
          const ev = JSON.parse(m.data) as AgentEvent;
          indexRef.current += 1;
          setEvents((prev) => [...prev, ev]);
          if (ev.type === "session.completed") {
            setStatus("done");
            es.close();
          }
          if (ev.type === "session.failed") {
            setStatus("failed");
            es.close();
          }
        };
        es.onerror = () => {
          es.close();
          if (indexRef.current >= 0) open();
        }; // reconnect from cursor
      };
      open();
    },
    [],
  );

  return { start, events, status };
}
```

> Reconnection is cursor-based: eve replays from `startIndex`, so a dropped SSE connection resumes without lost events and without re-running work.

- [ ] **Step 2: Overlay component**

Create `src/components/canvas/AgentLogOverlay.tsx`:

```tsx
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
```

> Event field names (`reasoningDelta`, `data.name`, `data.result`) are best-known from eve's stream docs; confirm exact shapes against the live stream from Task 9 and adjust `line()` mapping. This is display-only — no logic depends on it.

- [ ] **Step 3: Verify (after Task 11 wiring) + commit**

```bash
bun run typecheck
git add src/hooks/useAgentRun.ts src/components/canvas/AgentLogOverlay.tsx
git commit -m "feat(canvas): agent run hook + terminal log overlay"
```

---

## Task 11: wire the prompt bar Run to the agent

**Files:**

- Modify: `src/app/(authenticated)/canvas/[id]/page.tsx` (the `handleRun` path, ~line 1855) — route Run to `useAgentRun().start` and mount `<AgentLogOverlay>`.

**Interfaces:**

- Consumes: `useAgentRun` (Task 10), current `projectId`, `userId`/`sessionId` (from `useAuth()`), and the prompt-bar `generationSettings` (`prompt`, `referencedAssetIds`, `modelId`→kind, aspect ratio).

- [ ] **Step 1: Mount the overlay + hook in the canvas page**

Near the top of the canvas component:

```tsx
import { useAgentRun } from "@/hooks/useAgentRun";
import { AgentLogOverlay } from "@/components/canvas/AgentLogOverlay";
// ...
const {
  start: startAgentRun,
  events: agentEvents,
  status: agentStatus,
} = useAgentRun();
```

In the returned JSX, inside the canvas container (so `position:absolute` anchors to it):

```tsx
<AgentLogOverlay events={agentEvents} visible={agentStatus !== "idle"} />
```

- [ ] **Step 2: Route Run through the agent**

Replace the body of the Run handler (the fixed-model branch around `page.tsx:1855`) with a call to the agent. Derive `kind` from the active type button (the video button sets `generationSettings.modelId` to a video default; treat presence of a video modelId, or the video type toggle, as `kind: 'video'`, else `'image'`):

```tsx
const handleRun = useCallback(async () => {
  if (!currentProject?.id) return;
  const kind: "image" | "video" = isVideoMode ? "video" : "image"; // reuse the existing type-button state
  await startAgentRun({
    projectId: currentProject.id,
    userId: user?.id,
    sessionId,
    brief: generationSettings.prompt ?? "",
    kind,
    aspectRatio: generationSettings.imageSize,
    referencedAssetIds: generationSettings.referencedAssetIds,
  });
}, [
  currentProject?.id,
  user?.id,
  sessionId,
  isVideoMode,
  generationSettings,
  startAgentRun,
]);
```

> Use the page's existing state names for the video toggle and auth (`user`, `sessionId` from `useAuth()`, `isVideoMode`/the type-button state). Assets appear on the canvas automatically via the existing InstantDB reactive query — do not add asset-insertion code here.

- [ ] **Step 3: Full end-to-end verification**

Both servers running. In the app: type a brief in the prompt bar, hit Run.

- Expected: overlay (bottom-right) streams reasoning → `▸ generate(...)` → `✓ asset … credits`; within seconds the image/video appears on the canvas; the credit counter (top-right `357`) drops by the charged amount.
- Kill the network tab / reload mid-run: overlay reconnects from its cursor and the asset still lands (durable session).
- Insufficient credits path: set a tiny cap (`appConfig.agent.runCreditCap = 0`), Run → overlay shows `✗ cap_exceeded`, no asset, no charge.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "feat(canvas): route prompt-bar Run to the creative agent"
```

---

## Task 12: deploy the agent + wire production env

**Files:**

- Modify: deploy config (Vercel project for `agent/`), nusoma env.

- [ ] **Step 1: Deploy the eve agent**

From `agent/`, deploy per eve's generated README (`vercel deploy` / eve deploy guide). Set `agent/` project env: `FAL_KEY`, `NUSOMA_INTERNAL_URL` (production nusoma URL), `NUSOMA_SERVICE_SECRET`. AI Gateway uses Vercel OIDC automatically.

- [ ] **Step 2: Point nusoma at the deployed agent**

Set nusoma production env: `AGENT_URL` = deployed agent URL, `NUSOMA_SERVICE_SECRET` = same value as the agent.

- [ ] **Step 3: Smoke test production**

Run one brief in production; confirm asset lands + credits charged + overlay streams.

---

## Notes carried from the spec

- v1 cuts (do not implement now): per-node live preview (assets pop in on completion), recipe skills beyond `selecting-a-model`, expensive-run approval (`input.requested`), persisted run history, legacy fixed-model path stays intact but unreferenced from Run.
- The nusoma↔eve contract is intentionally thin (two internal endpoints + eve's session API) so `agent/` can be swapped for an AI SDK loop if eve's beta churns.
