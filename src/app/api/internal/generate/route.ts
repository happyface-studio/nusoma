import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createFalClient } from "@fal-ai/client";
import { db } from "@/lib/instant-admin";
import { id } from "@instantdb/admin";
import { appConfig } from "@/lib/config";
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

function secretOk(header: string | null): boolean {
  const expected = process.env.NUSOMA_SERVICE_SECRET ?? "";
  if (!header || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

const BodySchema = z.object({
  runId: z.string().min(1),
  endpoint: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  kind: z.enum(["image", "video"]),
  prompt: z.string().optional(),
  referencedAssetIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-nusoma-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { runId, endpoint, input, kind, prompt, referencedAssetIds } =
    parsed.data;

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
  if (prior?.status === "running") {
    // A concurrent identical call is already in flight — do not double-run or double-charge.
    return NextResponse.json({ error: "in_progress" }, { status: 409 });
  }
  // prior is 'failed' or absent → proceed (row id reused below if a failed prior exists).

  // Price once, then cap + credit checks against that single estimate.
  const check = await checkCreditsForGeneration(
    billingUser,
    endpoint,
    1,
    false,
  );
  const estimate = check.costEstimate;
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
  let assetId: string;
  try {
    assetId = await persistAgentAsset({
      url: media.url,
      kind,
      prompt: prompt ?? "",
      creditsConsumed: estimate.totalCredits,
      durationSeconds: media.durationSeconds,
      userId: run.userId,
      sessionId: run.sessionId,
      referencedAssetIds,
    });
  } catch (e) {
    await db.transact([
      db.tx.agentGenerations[genId].update({ status: "failed" }),
    ]);
    return NextResponse.json(
      { error: "generation_failed", detail: String(e) },
      { status: 502 },
    );
  }

  let charged = false;
  let remainingCredits: number | null = null;
  try {
    const charge = await processGenerationCharge(billingUser, estimate, {
      generation_type: "agent",
      model: endpoint,
      run_id: runId,
    });
    charged = charge.success === true;
    remainingCredits = charge.newBalance ?? null;
    if (!charged) {
      console.error("[agent-generate] Polar charge failed", {
        runId,
        endpoint,
        error: charge.error,
      });
    }
  } catch (e) {
    console.error("[agent-generate] Polar charge threw", {
      runId,
      endpoint,
      error: String(e),
    });
  }

  // Re-read spentCredits immediately before the increment to shrink the lost-update window
  // (InstantDB has no atomic increment; residual concurrency is bounded by the per-run cap — accepted per plan Global Constraints).
  const freshRun = (await db.query({ agentRuns: { $: { where: { runId } } } }))
    .agentRuns?.[0];
  const freshSpent =
    typeof freshRun?.spentCredits === "number"
      ? freshRun.spentCredits
      : run.spentCredits;
  await db.transact([
    db.tx.agentGenerations[genId].update({
      status: "completed",
      assetId,
      credits: estimate.totalCredits,
      cost: estimate.totalCostUsd,
    }),
    db.tx.agentRuns[run.id].update({
      spentCredits: freshSpent + estimate.totalCredits,
    }),
  ]);

  return NextResponse.json({
    assetId,
    url: media.url,
    cost: estimate.totalCostUsd,
    credits: estimate.totalCredits,
    remainingCredits,
    charged,
  });
}
