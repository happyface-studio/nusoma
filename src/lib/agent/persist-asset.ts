import { db } from "@/lib/instant-admin";
import { id } from "@instantdb/admin";

// Downloads a fal media URL and stores it in InstantDB via the ADMIN client,
// creating a canvasAssets row linked to the file, the user, and lineage.
export async function persistAgentAsset(opts: {
  url: string;
  kind: "image" | "video";
  prompt: string;
  creditsConsumed: number;
  durationSeconds?: number;
  userId?: string;
  sessionId?: string;
  referencedAssetIds?: string[];
}): Promise<string> {
  const assetId = id();
  const res = await fetch(opts.url);
  if (!res.ok) throw new Error(`fetch media failed: ${res.status}`);
  const contentType =
    res.headers.get("content-type") ??
    (opts.kind === "image" ? "image/png" : "video/mp4");
  const buffer = Buffer.from(await res.arrayBuffer());

  const owner = opts.userId ?? opts.sessionId ?? "anon";
  const path = `canvas-${opts.kind}s/${owner}/${assetId}`;
  const { data } = await db.storage.uploadFile(path, buffer, { contentType });

  const tx = db.tx.canvasAssets[assetId]
    .update({
      type: opts.kind,
      createdAt: new Date(),
      prompt: opts.prompt,
      creditsConsumed: opts.creditsConsumed,
      ...(opts.durationSeconds ? { duration: opts.durationSeconds } : {}),
    })
    .link({ file: data.id, ...(opts.userId ? { user: opts.userId } : {}) });

  const txs = [tx];
  for (const refId of opts.referencedAssetIds ?? []) {
    txs.push(db.tx.canvasAssets[assetId].link({ referencedAssets: refId }));
  }
  await db.transact(txs);
  return assetId;
}
