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
