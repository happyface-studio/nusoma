import { createHash } from "node:crypto";

export function extractMediaUrl(
  kind: "image" | "video",
  falResult: unknown,
): { url: string; durationSeconds?: number; width?: number; height?: number } {
  const data = (falResult as any)?.data ?? falResult;
  if (kind === "image") {
    const img = data?.images?.[0] ?? data?.image;
    const url = img?.url;
    if (typeof url === "string" && url.length > 0) {
      const out: { url: string; width?: number; height?: number } = { url };
      if (typeof img?.width === "number") out.width = img.width;
      if (typeof img?.height === "number") out.height = img.height;
      return out;
    }
  } else {
    const vid = data?.video ?? data?.videos?.[0];
    const url = vid?.url;
    if (typeof url === "string" && url.length > 0) {
      const out: {
        url: string;
        durationSeconds?: number;
        width?: number;
        height?: number;
      } = { url };
      if (typeof data?.duration === "number")
        out.durationSeconds = data.duration;
      if (typeof vid?.width === "number") out.width = vid.width;
      if (typeof vid?.height === "number") out.height = vid.height;
      return out;
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
