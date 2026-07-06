import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/instant-admin";
import { id } from "@instantdb/admin";
import { getUserCredits, type BillingUser } from "@/server/billing";
import {
  AGENT_URL,
  agentHeaders,
  type EveSessionState,
} from "@/lib/agent/eve-client";

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

  // Resume this project's durable eve session, or start a fresh one — via eve's HTTP session API.
  const saved = (
    await db.query({
      canvasProjects: { $: { where: { id: body.projectId } } },
    })
  ).canvasProjects?.[0]?.eveSessionState as EveSessionState | undefined;

  const resume = Boolean(saved?.sessionId && saved?.continuationToken);
  const url = resume
    ? `${AGENT_URL}/eve/v1/session/${saved!.sessionId}`
    : `${AGENT_URL}/eve/v1/session`;
  const payload = resume
    ? { continuationToken: saved!.continuationToken, message }
    : { message };

  const res = await fetch(url, {
    method: "POST",
    headers: agentHeaders(),
    body: JSON.stringify(payload),
  });
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
}
