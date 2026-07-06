import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/instant-admin";

function secretOk(header: string | null): boolean {
  const expected = process.env.NUSOMA_SERVICE_SECRET ?? "";
  if (!header || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-nusoma-secret"))) {
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
