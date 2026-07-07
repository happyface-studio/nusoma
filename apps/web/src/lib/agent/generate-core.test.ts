import { test, expect } from "bun:test";
import {
  extractMediaUrl,
  idempotencyKeyFor,
  capExceeded,
  errorDetail,
} from "./generate-core";

test("errorDetail surfaces fal validation body.detail, not the opaque message", () => {
  // Shape thrown by @fal-ai/client on a 422: message is useless, body.detail is actionable.
  const falErr = Object.assign(new Error("Unprocessable Entity"), {
    status: 422,
    body: {
      detail: [
        { type: "missing", loc: ["body", "prompt"], msg: "Field required" },
      ],
    },
  });
  const d = errorDetail(falErr) as Array<{ msg: string }>;
  expect(Array.isArray(d)).toBe(true);
  expect(d[0].msg).toBe("Field required");
});

test("errorDetail falls back to message, then String(e)", () => {
  expect(errorDetail(new Error("no media in fal result"))).toBe(
    "no media in fal result",
  );
  expect(errorDetail("boom")).toBe("boom");
});

test("extractMediaUrl reads fal image shape", () => {
  const r = { data: { images: [{ url: "https://fal/img.png" }] } };
  expect(extractMediaUrl("image", r)).toEqual({ url: "https://fal/img.png" });
});

test("extractMediaUrl reads fal video shape with duration", () => {
  const r = { data: { video: { url: "https://fal/v.mp4" }, duration: 5 } };
  expect(extractMediaUrl("video", r)).toEqual({
    url: "https://fal/v.mp4",
    durationSeconds: 5,
  });
});

test("extractMediaUrl throws when empty", () => {
  expect(() => extractMediaUrl("image", { data: {} })).toThrow(
    "no media in fal result",
  );
});

test("idempotencyKeyFor is stable for same args and differs on input", () => {
  const a = idempotencyKeyFor("run1", "fal-ai/x", { prompt: "cat" });
  const b = idempotencyKeyFor("run1", "fal-ai/x", { prompt: "cat" });
  const c = idempotencyKeyFor("run1", "fal-ai/x", { prompt: "dog" });
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

test("capExceeded is true only when spend would exceed cap", () => {
  expect(capExceeded(40, 20, 50)).toBe(true);
  expect(capExceeded(40, 10, 50)).toBe(false);
});

test("idempotencyKeyFor is stable regardless of input key order", () => {
  const a = idempotencyKeyFor("run1", "fal-ai/x", { a: 1, b: 2 });
  const b = idempotencyKeyFor("run1", "fal-ai/x", { b: 2, a: 1 });
  expect(a).toBe(b);
});

test("extractMediaUrl throws on empty url string", () => {
  expect(() =>
    extractMediaUrl("image", { data: { images: [{ url: "" }] } }),
  ).toThrow("no media in fal result");
});

test("extractMediaUrl captures image dimensions when present", () => {
  const r = {
    data: { images: [{ url: "https://fal/i.png", width: 1024, height: 768 }] },
  };
  expect(extractMediaUrl("image", r)).toEqual({
    url: "https://fal/i.png",
    width: 1024,
    height: 768,
  });
});
