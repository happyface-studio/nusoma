import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/instant-admin";
import { id } from "@instantdb/admin";
import { getUserCredits, type BillingUser } from "@/server/billing";
import {
  AGENT_URL,
  agentHeaders,
  type EveSessionState,
} from "@/lib/agent/eve-client";
import { verifyRequestUser, AuthError } from "@/lib/auth/verify";

const BodySchema = z.object({
  projectId: z.string().min(1),
  brief: z.string(),
  kind: z.enum(["image", "video"]).optional(),
  aspectRatio: z.string().optional(),
  referencedAssetIds: z.array(z.string()).optional(),
  // Canvas spot the client reserved for this run's first asset (see
  // findOpenSpot). Stored on the run so persistAgentAsset can place the asset
  // exactly where the loading placeholder is drawn.
  placement: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
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
    if (!parsed.success) {
      return NextResponse.json(
        { error: "bad_request", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

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

    const billingUser: BillingUser = { userId: user.id };
    const remainingCredits = await getUserCredits(billingUser);

    // Mint the opaque run token; store the verified identity + cap accounting.
    const runId = id();
    await db.transact([
      db.tx.agentRuns[id()].update({
        runId,
        userId: user.id,
        projectId: body.projectId,
        // Required by the live schema; matches agentGenerations' status vocabulary
        // ("running" -> "completed"/"failed"). The run is in-flight at creation.
        status: "running",
        spentCredits: 0,
        createdAt: new Date(),
        ...(body.placement ? { plannedPlacement: body.placement } : {}),
      }),
    ]);

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

    // A fresh eve session per run. The agent is stateless by design — every run
    // rebuilds context from the brief and the read_project tool (see
    // apps/agent/agent/instructions.md), so it needs no cross-run session memory.
    // Reusing a session also made the client replay the PRIOR turn's terminal
    // event — eve's per-session event log is cumulative and the stream rewinds to
    // 0 — which flipped the run to "done" and cleared the loading placeholder
    // seconds before the new asset existed.
    let res: Response;
    try {
      res = await fetch(`${AGENT_URL}/eve/v1/session`, {
        method: "POST",
        headers: agentHeaders(),
        body: JSON.stringify({ message }),
      });
    } catch (e) {
      return NextResponse.json(
        { error: "agent_unavailable", detail: String(e) },
        { status: 502 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: "agent_unavailable", status: res.status },
        { status: 502 },
      );
    }

    const eveSessionId = res.headers.get("x-eve-session-id") ?? null;

    // Bind /api/agent/stream to this run's session (owner + session match).
    const state: EveSessionState = {
      sessionId: eveSessionId ?? undefined,
      streamIndex: 0,
    };
    await db.transact([
      db.tx.canvasProjects[body.projectId].update({ eveSessionState: state }),
    ]);

    return NextResponse.json({ runId, eveSessionId });
  } catch (e) {
    console.error(
      "[agent-run] unhandled error",
      e instanceof Error ? (e.stack ?? e.message) : String(e),
    );
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
