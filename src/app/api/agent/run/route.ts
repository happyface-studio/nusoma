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

const BodySchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  brief: z.string(),
  kind: z.enum(["image", "video"]).optional(),
  aspectRatio: z.string().optional(),
  referencedAssetIds: z.array(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "bad_request", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // Confirm the project exists before minting anything (InstantDB .update is an
    // upsert, so a bad projectId would otherwise create a phantom canvasProjects row).
    const projQ = await db.query({
      canvasProjects: { $: { where: { id: body.projectId } } },
    });
    const project = projQ.canvasProjects?.[0];
    if (!project) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const saved = (project as { eveSessionState?: EveSessionState })
      .eveSessionState;

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

    const resume = Boolean(saved?.sessionId && saved?.continuationToken);
    const url = resume
      ? `${AGENT_URL}/eve/v1/session/${saved!.sessionId}`
      : `${AGENT_URL}/eve/v1/session`;
    const payload = resume
      ? { continuationToken: saved!.continuationToken, message }
      : { message };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: agentHeaders(),
        body: JSON.stringify(payload),
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

    const eveSessionId =
      res.headers.get("x-eve-session-id") ?? saved?.sessionId ?? null;
    const data = (await res.json().catch(() => ({}))) as {
      continuationToken?: string;
    };

    const state: EveSessionState = {
      sessionId: eveSessionId ?? undefined,
      continuationToken: data.continuationToken ?? saved?.continuationToken,
      streamIndex: 0,
    };
    await db.transact([
      db.tx.canvasProjects[body.projectId].update({ eveSessionState: state }),
    ]);

    return NextResponse.json({ runId, eveSessionId });
  } catch (e) {
    console.error("[agent-run] unhandled error", { error: String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
