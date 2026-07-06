// Credit Billing Service with Polar Integration

import { api as polar } from "./polar";
import { estimateFalCost, CostEstimate } from "./fal-pricing";
import { appConfig } from "./config";

export interface BillingContext {
  /** User ID for authenticated users */
  userId?: string;
  /** Session ID for unauthenticated users */
  sessionId?: string;
  /** Current credit balance */
  currentCredits: number;
}

export interface ChargeResult {
  success: boolean;
  creditsCharged: number;
  remainingCredits: number;
  costEstimate: CostEstimate;
  error?: string;
}

/**
 * Checks if a user has sufficient credits for a generation
 * @param ctx - Billing context with user info and current credits
 * @param endpoint - FAL endpoint to estimate cost for
 * @param quantity - Number of units to generate
 * @returns Object with canProceed flag and cost estimate
 */
export async function checkCredits(
  ctx: BillingContext,
  endpoint: string,
  quantity: number = 1,
): Promise<{
  canProceed: boolean;
  costEstimate: CostEstimate;
  shortfall?: number;
}> {
  const costEstimate = await estimateFalCost(endpoint, quantity);

  const canProceed = ctx.currentCredits >= costEstimate.totalCredits;
  const shortfall = canProceed
    ? undefined
    : costEstimate.totalCredits - ctx.currentCredits;

  return {
    canProceed,
    costEstimate,
    shortfall,
  };
}

/**
 * Records a usage event with Polar after a successful generation
 * This is used for credit-based billing with metered events
 * @param ctx - Billing context with user info
 * @param costEstimate - The cost estimate from the generation
 * @param metadata - Additional metadata to attach to the event
 */
export async function recordUsageEvent(
  ctx: BillingContext,
  costEstimate: CostEstimate,
  metadata: Record<string, string | number> = {},
): Promise<void> {
  const customerId = ctx.userId || ctx.sessionId;

  if (!customerId) {
    console.warn("No customer ID available for usage event");
    return;
  }

  try {
    await polar.events.ingest({
      events: [
        {
          name: "fal_usage",
          externalCustomerId: customerId,
          metadata: {
            endpoint: costEstimate.endpoint,
            fal_cost_usd: costEstimate.falCost.toFixed(4),
            margin_usd: costEstimate.marginAmount.toFixed(4),
            total_usd: costEstimate.totalCostUsd.toFixed(4),
            credits_charged: costEstimate.totalCredits,
            margin_percentage: appConfig.billing.marginPercentage * 100,
            ...metadata,
          },
        },
      ],
    });

    console.log(
      `Recorded usage event for ${customerId}: ${costEstimate.totalCredits} credits`,
    );
  } catch (error) {
    console.error("Failed to record usage event with Polar:", error);
    // Don't throw - we don't want to fail the generation if billing event fails
    // The credits are already deducted from the user's balance
  }
}

/**
 * Processes a billable generation:
 * 1. Estimates the cost
 * 2. Checks if user has sufficient credits
 * 3. If using custom API key, skips billing
 * 4. Returns the deduction amount for the caller to handle
 *
 * @param ctx - Billing context
 * @param endpoint - FAL endpoint
 * @param quantity - Number of units
 * @param useCustomApiKey - Whether the user is using their own API key
 */
export async function prepareCharge(
  ctx: BillingContext,
  endpoint: string,
  quantity: number = 1,
  useCustomApiKey: boolean = false,
): Promise<{
  shouldCharge: boolean;
  costEstimate: CostEstimate;
  error?: string;
}> {
  // If using custom API key, no charge needed
  if (useCustomApiKey) {
    const costEstimate = await estimateFalCost(endpoint, quantity);
    return {
      shouldCharge: false,
      costEstimate,
    };
  }

  const { canProceed, costEstimate, shortfall } = await checkCredits(
    ctx,
    endpoint,
    quantity,
  );

  if (!canProceed) {
    return {
      shouldCharge: false,
      costEstimate,
      error: `Insufficient credits. You need ${costEstimate.totalCredits} credits but only have ${ctx.currentCredits}. Please purchase ${shortfall} more credits to continue.`,
    };
  }

  return {
    shouldCharge: true,
    costEstimate,
  };
}

/**
 * Completes the billing cycle after a successful generation
 * Records the event with Polar for analytics and metering
 *
 * @param ctx - Billing context
 * @param costEstimate - The cost estimate from prepareCharge
 * @param metadata - Additional metadata for the event
 */
export async function completeCharge(
  ctx: BillingContext,
  costEstimate: CostEstimate,
  metadata: Record<string, string | number> = {},
): Promise<void> {
  await recordUsageEvent(ctx, costEstimate, metadata);
}

/**
 * Helper to calculate credits from USD amount
 */
export function usdToCredits(usd: number): number {
  return Math.ceil(usd / appConfig.billing.creditToUsdRate);
}

/**
 * Helper to calculate USD from credits
 */
export function creditsToUsd(credits: number): number {
  return credits * appConfig.billing.creditToUsdRate;
}
