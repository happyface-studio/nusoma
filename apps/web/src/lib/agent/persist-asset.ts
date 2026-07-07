import { db } from "@/lib/instant-admin";
import { id } from "@instantdb/admin";
import { findOpenSpot, type Rect } from "@/lib/canvas-placement";

// Downloads a fal media URL, stores it in InstantDB via the ADMIN client, and places it on the
// canvas. Creates BOTH a canvasAssets row (file + user + lineage) AND a canvasElements row linked
// to the project and the asset — the canvas renders only assets reachable via
// project -> elements -> asset, so without the element + project link the media never appears.
export async function persistAgentAsset(opts: {
  url: string;
  kind: "image" | "video";
  prompt: string;
  creditsConsumed: number;
  projectId: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  userId?: string;
  sessionId?: string;
  referencedAssetIds?: string[];
  // Spot the client reserved on click (and drew the placeholder at). Used as the
  // preferred position so the asset lands exactly where the placeholder was.
  placement?: { x?: number; y?: number };
}): Promise<string> {
  const assetId = id();
  const elementId = id();
  const res = await fetch(opts.url);
  if (!res.ok) throw new Error(`fetch media failed: ${res.status}`);
  const contentType =
    res.headers.get("content-type") ??
    (opts.kind === "image" ? "image/png" : "video/mp4");
  const buffer = Buffer.from(await res.arrayBuffer());

  const owner = opts.userId ?? opts.sessionId ?? "anon";
  const path = `canvas-${opts.kind}s/${owner}/${assetId}`;
  const { data } = await db.storage.uploadFile(path, buffer, { contentType });

  // Place the asset in an open spot so it never lands on top of existing canvas
  // content (the old `count % 8` stagger overlapped whatever was already there).
  const projQ = await db.query({
    canvasProjects: { $: { where: { id: opts.projectId } }, elements: {} },
  });
  const elements =
    ((projQ.canvasProjects?.[0] as { elements?: unknown[] } | undefined)
      ?.elements as
      | Array<{ x?: number; y?: number; width?: number; height?: number }>
      | undefined) ?? [];
  const count = elements.length;
  const width = opts.width ?? (opts.kind === "image" ? 1024 : 1280);
  const height = opts.height ?? (opts.kind === "image" ? 1024 : 720);
  const existing: Rect[] = elements
    .filter((e) => typeof e.x === "number" && typeof e.y === "number")
    .map((e) => ({
      x: e.x as number,
      y: e.y as number,
      width: e.width ?? 1024,
      height: e.height ?? 1024,
    }));
  const preferred =
    typeof opts.placement?.x === "number" &&
    typeof opts.placement?.y === "number"
      ? { x: opts.placement.x, y: opts.placement.y }
      : undefined;
  const { x, y } = findOpenSpot(existing, width, height, preferred);

  const assetTx = db.tx.canvasAssets[assetId]
    .update({
      type: opts.kind,
      createdAt: new Date(),
      prompt: opts.prompt,
      creditsConsumed: opts.creditsConsumed,
      ...(opts.durationSeconds ? { duration: opts.durationSeconds } : {}),
    })
    .link({ file: data.id, ...(opts.userId ? { user: opts.userId } : {}) });

  const elementTx = db.tx.canvasElements[elementId]
    .update({
      type: opts.kind,
      x,
      y,
      width,
      height,
      zIndex: count,
      ...(opts.durationSeconds ? { duration: opts.durationSeconds } : {}),
    })
    .link({ project: opts.projectId, asset: assetId });

  const txs = [assetTx, elementTx];
  for (const refId of opts.referencedAssetIds ?? []) {
    txs.push(db.tx.canvasAssets[assetId].link({ referencedAssets: refId }));
  }
  await db.transact(txs);
  return assetId;
}
