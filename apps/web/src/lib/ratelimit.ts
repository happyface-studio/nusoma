import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimiter = {
  perMinute: Ratelimit;
  perHour: Ratelimit;
  perDay: Ratelimit;
};

const redis = Redis.fromEnv();

export const createRateLimiter = (tokens: number, window: string) => {
  console.log(`[DEBUG] Creating rate limiter: ${tokens} tokens per ${window}`);
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(tokens, window as any),
    analytics: true,
    prefix: "@upstash/ratelimit",
  });
};

type LimitPeriod = "perMinute" | "perHour" | "perDay";

export const RATE_LIMIT_PERIOD_LABELS: Record<LimitPeriod, string> = {
  perMinute: "minute",
  perHour: "hour",
  perDay: "day",
};

type LimitResult =
  | {
      shouldLimitRequest: false;
    }
  | { shouldLimitRequest: true; period: LimitPeriod };

export const IS_RATE_LIMITER_ENABLED =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

console.log(`[DEBUG] Rate limiter enabled: ${IS_RATE_LIMITER_ENABLED}`);
console.log(
  `[DEBUG] UPSTASH_REDIS_REST_URL present: ${!!process.env.UPSTASH_REDIS_REST_URL}`,
);
console.log(
  `[DEBUG] UPSTASH_REDIS_REST_TOKEN present: ${!!process.env.UPSTASH_REDIS_REST_TOKEN}`,
);

export async function shouldLimitRequest(
  limiter: RateLimiter,
  ip: string,
  keyPrefix?: string,
): Promise<LimitResult> {
  console.log(
    `[DEBUG] Checking rate limit for IP: ${ip}${keyPrefix ? ` with prefix: ${keyPrefix}` : ""}`,
  );

  if (!IS_RATE_LIMITER_ENABLED) {
    console.log(`[DEBUG] Rate limiter disabled, allowing request`);
    return { shouldLimitRequest: false };
  }

  const rateLimitKey = keyPrefix ? `${keyPrefix}:${ip}` : ip;
  const limits = ["perDay", "perHour", "perMinute"] as const;

  for (const limit of limits) {
    const result = await limiter[limit].limit(rateLimitKey);
    console.log(`[DEBUG] ${limit} limit result for key ${rateLimitKey}:`, {
      success: result.success,
      remaining: result.remaining,
      reset: result.reset,
      limit: result.limit,
    });

    if (!result.success) {
      console.log(`[DEBUG] Rate limit exceeded for period: ${limit}`);
      return {
        shouldLimitRequest: true,
        period: limit,
      };
    }
  }

  console.log(`[DEBUG] All rate limits passed`);
  return { shouldLimitRequest: false };
}
