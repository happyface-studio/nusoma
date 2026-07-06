import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/instant-admin";

function secretOk(header: string | null): boolean {
  const expected = process.env.NUSOMA_SERVICE_SECRET ?? "";
  if (!header || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

const BodySchema = z.object({ runId: z.string().min(1) });

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-nusoma-secret"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Resolve the project from the run (bound at run creation) so the agent can only read the
  // project its OWN run belongs to — never an arbitrary client-supplied projectId (IDOR).
  const run = (
    await db.query({
      agentRuns: { $: { where: { runId: parsed.data.runId } } },
    })
  ).agentRuns?.[0];
  if (!run) {
    return NextResponse.json({ error: "unknown_run" }, { status: 404 });
  }
  const projectId = run.projectId as string;

  const q = await db.query({
    canvasProjects: {
      $: { where: { id: projectId } },
      elements: { asset: { referencedAssets: {} } },
    },
  });
  const project = q.canvasProjects?.[0];
  if (!project) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

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
