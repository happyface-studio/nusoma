import { createHash } from "node:crypto";

export function extractMediaUrl(
  kind: "image" | "video",
  falResult: unknown,
): { url: string; durationSeconds?: number } {
  const data = (falResult as any)?.data ?? falResult;
  if (kind === "image") {
    const url = data?.images?.[0]?.url ?? data?.image?.url;
    if (typeof url === "string") return { url };
  } else {
    const url = data?.video?.url ?? data?.videos?.[0]?.url;
    if (typeof url === "string") {
      const durationSeconds =
        typeof data?.duration === "number" ? data.duration : undefined;
      return { url, durationSeconds };
    }
  }
  throw new Error("no media in fal result");
}

export function idempotencyKeyFor(
  runId: string,
  endpoint: string,
  input: unknown,
): string {
  const canonical = JSON.stringify({ runId, endpoint, input });
  return createHash("sha256").update(canonical).digest("hex");
}

export function capExceeded(
  spentCredits: number,
  nextCredits: number,
  cap: number,
): boolean {
  return spentCredits + nextCredits > cap;
}
