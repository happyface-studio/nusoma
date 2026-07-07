import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/instant-admin";
import { id } from "@instantdb/admin";
import { getUserCredits, type BillingUser } from "@/server/billing";
import { resolveRunIdentity } from "@/lib/agent/run-auth";
import {
  AGENT_URL,
  agentHeaders,
  type EveSessionState,
} from "@/lib/agent/eve-client";

const BodySchema = z.object({
  projectId: z.string().min(1),
  // Guest session cookie; only honoured if it matches the project's sessionId.
  sessionId: z.string().optional(),
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
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "bad_request", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // Authed callers prove who they are with their InstantDB refresh token;
    // billing identity is NEVER taken from the request body.
    let verifiedUserId: string | undefined;
    const authz = req.headers.get("authorization");
    if (authz?.startsWith("Bearer ")) {
      try {
        verifiedUserId = (await db.auth.verifyToken(authz.slice(7)))?.id;
      } catch {
        verifiedUserId = undefined;
      }
      if (!verifiedUserId) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
    }

    // Confirm the project exists before minting anything (InstantDB .update is an
    // upsert, so a bad projectId would otherwise create a phantom canvasProjects row).
    const projQ = await db.query({
      canvasProjects: { $: { where: { id: body.projectId } }, user: {} },
    });
    const project = projQ.canvasProjects?.[0];
    if (!project) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const ownerLink = (project as { user?: { id: string } | { id: string }[] })
      .user;
    const identity = resolveRunIdentity(
      {
        ownerUserId: Array.isArray(ownerLink)
          ? ownerLink[0]?.id
          : ownerLink?.id,
        projectSessionId: (project as { sessionId?: string }).sessionId,
      },
      verifiedUserId,
      body.sessionId,
    );
    if (!identity.ok) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const saved = (project as { eveSessionState?: EveSessionState })
      .eveSessionState;

    const billingUser: BillingUser = {
      userId: identity.userId,
      sessionId: identity.sessionId,
    };
    const remainingCredits = await getUserCredits(billingUser);

    // Mint the opaque run token; store identity + cap accounting.
    const runId = id();
    const runRowId = id();
    await db.transact([
      db.tx.agentRuns[runRowId].update({
        runId,
        userId: identity.userId,
        sessionId: identity.sessionId,
        projectId: body.projectId,
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

    // Capability token for /api/agent/stream: only the caller who started the
    // run receives it, and the stream route requires it (agentRuns perms deny
    // client reads, so it can't be queried out of the DB).
    const streamToken = randomUUID();

    const state: EveSessionState = {
      sessionId: eveSessionId ?? undefined,
      continuationToken: data.continuationToken ?? saved?.continuationToken,
      streamIndex: 0,
    };
    await db.transact([
      db.tx.canvasProjects[body.projectId].update({ eveSessionState: state }),
      db.tx.agentRuns[runRowId].update({
        eveSessionId: eveSessionId ?? undefined,
        streamToken,
      }),
    ]);

    return NextResponse.json({ runId, eveSessionId, streamToken });
  } catch (e) {
    console.error("[agent-run] unhandled error", { error: String(e) });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
