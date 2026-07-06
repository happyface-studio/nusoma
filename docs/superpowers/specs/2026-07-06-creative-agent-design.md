# Creative Agent ("Creative Supercomputer") — Design

**Date:** 2026-07-06
**Status:** Approved design, pre-implementation
**Owner:** Simon Weniger

## 1. Summary

Replace nusoma's fixed-model asset generation (heuristics over `models-config.ts`) with an
agent-based system built on Vercel's [eve](https://eve.dev) framework. The agent acts as a
creative director: given a brief from the existing canvas prompt bar, it plans, discovers and
selects fal.ai models dynamically (full 1000+ catalog via the fal MCP server), and fires one or
more generations across turns. Every request always ends in ≥1 media asset on the canvas; the
agent's reasoning and tool activity stream into a terminal-style log overlay (bottom-right of
the canvas).

**Core principle: eve reasons, nusoma executes.** The agent's only write path is a
nusoma-owned `generate` tool. Money, persistence, and streaming never leave nusoma's existing
pipeline.

## 2. Decisions made (with rationale)

| Decision        | Choice                                                                                 | Rationale                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Agent surface   | Existing prompt bar as sole input; canvas + log overlay as output. No chat transcript. | A request always yields media on canvas; the log overlay is the "conversation".                                           |
| Model freedom   | Free-roam over fal's full catalog, dynamic pricing                                     | The point of the system; curated lists defeat it. Safety via server-enforced spend caps.                                  |
| Execution owner | nusoma executes; agent delegates via `generate` tool                                   | One place owns money + data. Agent never touches DB or wallet directly.                                                   |
| eve deployment  | Separate deploy, top-level `agent/` directory in this repo                             | eve is filesystem-first, serves its own HTTP on Vercel Workflow. Keeps Next app lean.                                     |
| Memory          | One eve session per `canvasProject`                                                    | Durable sessions = memory across turns. Reopening a project reopens its session.                                          |
| fal MCP role    | Discovery only (`search_models`, `get_schema`, `check_pricing`, `recommend`)           | Execution goes through nusoma's `generate` tool, never the MCP's run tools.                                               |
| Log transport   | Thin SSE proxy route handler, NOT a tRPC subscription relay                            | Multi-generation runs exceed 10 min; eve's durable event log replays on re-attach, so a dropped connection loses nothing. |
| Agent model     | `anthropic/claude-sonnet-5` via AI Gateway                                             | eve default; OIDC auth on Vercel, no provider keys to manage.                                                             |

## 3. Architecture

```
┌─ Canvas (existing) ─────────────────────────────────────┐
│  Prompt bar ──Run──▶ POST /api/agent/run                 │
│  Canvas assets ◀── InstantDB reactivity (existing)       │
│  Terminal log overlay ◀── GET /api/agent/stream/[sid]    │
└───────────────┬──────────────────────────────────────────┘
                │ start/continue session (HTTP + AGENT_SERVICE_SECRET)
                ▼
┌─ eve agent (agent/, separate Vercel deploy) ─────────────┐
│  instructions.md   creative-director contract            │
│  agent.ts          defineAgent({ model: sonnet-5 })      │
│  connections/fal   fal MCP, Bearer $FAL_KEY, discovery   │
│  tools/generate.ts       → nusoma internal endpoint      │
│  tools/read_project.ts   → nusoma internal endpoint      │
│  skills/selecting-a-model.md                             │
└───────────────┬──────────────────────────────────────────┘
                │ callbacks (HTTP + NUSOMA_SERVICE_SECRET)
                ▼
┌─ nusoma server (existing Next app) ──────────────────────┐
│  /api/internal/generate   price → reserve → run fal →    │
│                           persist asset+lineage → settle │
│  /api/internal/project    read project graph (InstantDB) │
└──────────────────────────────────────────────────────────┘
```

The nusoma↔eve contract is deliberately a **thin waist**: two tools + eve's session HTTP API.
If eve's beta APIs churn or the framework is abandoned, the `agent/` directory can be swapped
for an AI SDK agent loop without touching canvas, billing, or persistence.

## 4. Components

### 4.1 eve project (`agent/`, new)

- **`instructions.md`** — the creative-director contract:
  - Every run MUST end in ≥1 successful `generate` call (media on canvas). Text-only outcomes
    are failures unless the run was blocked by credits/errors, which must be explained in the log.
  - Reason in the open (reasoning streams to the log overlay).
  - Use fal MCP for discovery + pricing only; never its run/submit tools.
  - Respect the advisory credit budget passed in context (hard cap is server-enforced anyway).
- **`agent.ts`** — `defineAgent({ model: 'anthropic/claude-sonnet-5' })`.
- **`connections/`** — fal MCP: `https://mcp.fal.ai/mcp`, Streamable HTTP,
  `Authorization: Bearer $FAL_KEY` static header. Expose discovery tools only if the connection
  config supports tool filtering; otherwise instructions forbid run tools (acceptable because
  the MCP run tools produce URLs the agent has no way to persist or bill — the money path is
  unreachable from there).
- **`tools/generate.ts`** — `defineTool`. Input:
  `{ endpoint, input, kind: 'image'|'video', projectId, referencedAssetIds?, toolCallId }`.
  POSTs `/api/internal/generate` with the service secret. Returns
  `{ assetId, url, cost, credits }` or a structured error
  (`insufficient_credits` | `cap_exceeded` | `generation_failed` | `unpriceable_model`).
- **`tools/read_project.ts`** — input `{ projectId }`; returns the project graph (elements,
  assets with prompts, lineage) via `/api/internal/project`. This is the agent's project
  knowledge; memory is reconstructable from it if a session is ever lost.
- **`skills/selecting-a-model.md`** — how to trade quality/speed/price, when LoRA applies,
  image vs video model families, when to chain (image → image-to-video).

### 4.2 nusoma additions

- **`POST /api/internal/generate`** (new route handler, service-secret auth):
  1. Verify secret; verify `projectId` belongs to the session's user.
  2. **Idempotency:** look up `toolCallId` (+ sessionId); if seen, return the prior result.
  3. **Price** the endpoint server-side (§6 open question) → credits via existing margin logic.
  4. **Reserve:** deduct credits now (reserve-then-settle). Refuse with `insufficient_credits`
     if balance < cost; refuse with `cap_exceeded` if run's cumulative spend would exceed the
     per-run hard cap.
  5. Run fal via existing `@fal-ai/client` (queue submit + poll for long video jobs).
  6. Persist via existing `instant-storage` path: upload → `canvasAssets` + `assetLineage`
     (link `referencedAssetIds`) + user link.
  7. **Settle:** on success keep the deduction, record actual cost; on failure refund fully.
  8. Return result. On fal failure after one retry: refund + structured error.
- **`POST /api/agent/run`** (new, user-authed): resolves the project's eve session (create or
  continue via stored `continuationToken`), sends the brief + context (refs, kind, aspect
  ratio, remaining credits), returns `{ sessionId }`. Fire-and-forget — the run continues
  server-side regardless of the client.
- **`GET /api/agent/stream/[sessionId]`** (new, user-authed): thin proxy of eve's NDJSON
  event stream → SSE. Client auto-reconnects; eve replays the event log on re-attach.
- **`fal-pricing.ts`** — generalize from fixed table to `priceForEndpoint(endpoint, input)`
  (§6). Never trusts agent-supplied prices.
- **Schema** — `canvasProjects` gains `eveSessionId`, `eveContinuationToken`. New entity
  `agentGenerations` `{ toolCallId, sessionId, assetId, cost, credits, status, createdAt }`
  serving idempotency, per-run cap accounting, and an audit trail.
- **Log overlay** (new component) — terminal-style panel, bottom-right. Renders SSE events:
  `reasoning.appended` → dim text; `actions.requested` → "▸ tool(args)";
  `action.result` → "✓ done · N credits"; errors in red. Ephemeral (no persistence) in v1;
  reconnect replays.
- **Prompt bar wiring** — Run calls `/api/agent/run` instead of `handleRun`'s fixed-model
  branch. The legacy path stays intact behind the seam (cheap rollback / future "direct mode").

## 5. One run, end to end

1. User types brief, hits Run → `POST /api/agent/run`.
2. nusoma opens/continues the project session with brief + context; client opens the SSE
   stream → overlay starts printing.
3. Agent reads project (`read_project` if needed), reasons, discovers candidates via fal MCP,
   checks pricing, picks model(s).
4. Agent calls `generate` → nusoma prices, reserves, runs fal, persists, settles.
5. Asset appears on canvas via InstantDB reactivity. Overlay prints result + cost.
6. Agent may loop (e.g., stills first, then image-to-video). `session.completed` → run ends;
   continuation token saved on the project for the next turn.

## 6. Open questions (resolve during implementation, phase 2)

1. **Server-side pricing source.** fal's MCP has `check_pricing`, but nusoma's server needs its
   own trusted source. In order of preference: (a) a fal HTTP pricing/models API if one exists;
   (b) nusoma acts as an MCP client for the single `check_pricing` call; (c) price post-hoc
   from fal's billed-cost response metadata, with the reserve made from an estimate. If an
   endpoint can't be priced at all → refuse with `unpriceable_model` (agent picks another).
2. **fal MCP tool filtering** in eve connection config — filter to discovery tools if
   supported; instructions-only otherwise (see §4.1 for why this is safe).
3. **eve session compaction** — verify long-lived sessions don't grow unboundedly; mitigation
   is cheap (fresh session, memory rebuilt via `read_project`).

## 7. Error handling & money invariants

- **Never let the model be the enforcement point.** Instructions shape behavior; the server
  enforces invariants:
  - Idempotency: one charge per `toolCallId`, ever.
  - Reserve-then-settle: no partial charges; failures refund fully.
  - Per-run hard cap: cumulative session-run spend limit enforced by the endpoint, independent
    of the advisory budget given to the model. Value lives in `appConfig`
    (`agentRunCreditCap`, default 50 credits) so it's tunable without a deploy of the agent.
- `insufficient_credits` / `cap_exceeded` → structured tool error → agent picks a cheaper model
  or explains in the log. Run ends without media only in this blocked case.
- fal failure → one retry, then refund + structured error.
- Stream disconnect → overlay reconnects and replays; the durable session never noticed.
- Agent deploy wiped → conversational memory lost, nothing else; project knowledge rebuilds
  from `read_project`.

## 8. Deliberate v1 cuts

- No per-node live preview during generation — assets pop in on completion; progress lives in
  the log. (Add later by re-wiring `StreamingImage`/`StreamingVideo` to agent runs.)
- One skill (`selecting-a-model`); recipe skills (product-shot, stills→video) later.
- No expensive-run user approval (eve `authorization.required`) — hard cap covers v1.
- Log overlay is ephemeral; persisted run history later if wanted.
- Legacy fixed-model path untouched but unreferenced from the Run button.

## 9. Build order

1. eve scaffold in `agent/` + fal MCP connection + `generate`/`read_project` tools +
   instructions + skill. Verify locally with `eve dev`.
2. nusoma: `/api/internal/generate` (idempotency, reserve/settle, cap), `/api/internal/project`,
   `priceForEndpoint` (resolve open question 1), schema additions.
3. `/api/agent/run` + `/api/agent/stream/[sessionId]` SSE proxy.
4. Log overlay component.
5. Wire prompt-bar Run to the agent. Manual e2e.

## 10. Testing

- **Unit (mandatory, money path):** `priceForEndpoint`; reserve refuses when balance < cost;
  refund on failure; idempotent replay returns prior result without charging; cap refusal.
- **Integration:** one run with mocked fal asserting asset persisted + credits deducted +
  lineage linked + `agentGenerations` row written.
- **Manual e2e:** brief → overlay streams reasoning/tools → asset lands on canvas → credits
  correct; kill the SSE connection mid-run → reconnect replays and the asset still lands.

## 11. Risks accepted

- eve is ~3 weeks old, in beta; APIs may churn. Hedge: the thin waist (§3) makes the agent
  swappable for an AI SDK loop.
- Every Run pays an LLM planning hop (seconds + tokens). Acceptable for the product; "direct
  mode" toggle is trivial later because the legacy path survives.
