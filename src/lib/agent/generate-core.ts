import { createHash } from "node:crypto";

export function extractMediaUrl(
  kind: "image" | "video",
  falResult: unknown,
): { url: string; durationSeconds?: number } {
  const data = (falResult as any)?.data ?? falResult;
  if (kind === "image") {
    const url = data?.images?.[0]?.url ?? data?.image?.url;
    if (typeof url === "string" && url.length > 0) return { url };
  } else {
    const url = data?.video?.url ?? data?.videos?.[0]?.url;
    if (typeof url === "string" && url.length > 0) {
      const durationSeconds =
        typeof data?.duration === "number" ? data.duration : undefined;
      return { url, durationSeconds };
    }
  }
  throw new Error("no media in fal result");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function idempotencyKeyFor(
  runId: string,
  endpoint: string,
  input: unknown,
): string {
  const canonical = stableStringify({ endpoint, input, runId });
  return createHash("sha256").update(canonical).digest("hex");
}

export function capExceeded(
  spentCredits: number,
  nextCredits: number,
  cap: number,
): boolean {
  return spentCredits + nextCredits > cap;
}
