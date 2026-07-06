// Server-side Billing Utilities
// Uses Polar's credit system with meters and event ingestion

import { api as polar } from "@/lib/polar";
import { estimateFalCost, CostEstimate } from "@/lib/fal-pricing";
import { appConfig } from "@/lib/config";

export interface BillingUser {
  userId?: string;
  sessionId?: string;
}

export interface BillingCheckResult {
  canProceed: boolean;
  costEstimate: CostEstimate;
  currentCredits: number;
  shortfall?: number;
  error?: string;
}

export interface ChargeResult {
  success: boolean;
  creditsCharged: number;
  newBalance: number;
  costEstimate: CostEstimate;
  error?: string;
}

/**
 * Gets the user's current credit balance from Polar's meter
 */
export async function getUserCredits(user: BillingUser): Promise<number> {
  if (!user.userId) {
    return 0;
  }

  try {
    // Get customer by external ID
    let customer;
    try {
      console.log(
        `[Billing] Looking up customer with externalId: ${user.userId}`,
      );
      customer = await polar.customers.getExternal({
        externalId: user.userId,
      });
      console.log(`[Billing] Found customer:`, {
        id: customer.id,
        email: customer.email,
        externalId: customer.externalId,
      });
    } catch (error: any) {
      // Customer not found - this is expected for users who haven't purchased yet
      if (error?.statusCode === 404 || error?.error === "ResourceNotFound") {
        console.log(
          `[Billing] No Polar customer found for user ${user.userId} (not yet purchased)`,
        );
        return 0;
      }
      throw error;
    }

    if (!customer) {
      console.log(`[Billing] No Polar customer found for user ${user.userId}`);
      return 0;
    }

    // Get the customer's meter balance
    const meters = await polar.customerMeters.list({
      customerId: customer.id,
    });

    console.log(`[Billing] Customer meters response:`, {
      itemCount: meters.result.items.length,
      meters: meters.result.items.map((m) => ({
        meterName: m.meter.name,
        meterId: m.meter.id,
        balance: m.balance,
        consumedUnits: m.consumedUnits,
        creditedUnits: m.creditedUnits,
      })),
    });

    // Find our usage meter by name
    const usageMeter = meters.result.items.find(
      (m) => m.meter.name === appConfig.billing.meterSlug,
    );

    if (!usageMeter) {
      console.log(
        `[Billing] No meter '${appConfig.billing.meterSlug}' found for customer. Available meters:`,
        meters.result.items.map((m) => m.meter.name),
      );
      return 0;
    }

    // The balance is credits remaining (granted - consumed)
    const balance = usageMeter.balance ?? 0;
    console.log(
      `[Billing] User ${user.userId} has ${balance} credits (credited: ${usageMeter.creditedUnits}, consumed: ${usageMeter.consumedUnits})`,
    );

    return balance;
  } catch (error) {
    console.error("Failed to get user credits from Polar:", error);
    return 0;
  }
}

/**
 * Checks if the user has sufficient credits for the generation
 */
export async function checkCreditsForGeneration(
  user: BillingUser,
  endpoint: string,
  quantity: number = 1,
  useCustomApiKey: boolean = false,
): Promise<BillingCheckResult> {
  // If using custom API key, no credits needed
  if (useCustomApiKey) {
    const costEstimate = await estimateFalCost(endpoint, quantity);
    return {
      canProceed: true,
      costEstimate,
      currentCredits: 0,
    };
  }

  // For unauthenticated users without API key, they can't generate
  if (!user.userId) {
    const costEstimate = await estimateFalCost(endpoint, quantity);
    return {
      canProceed: false,
      costEstimate,
      currentCredits: 0,
      error:
        "Please sign in or provide your own FAL API key to generate content.",
    };
  }

  // Get current credits from Polar
  const currentCredits = await getUserCredits(user);

  // Estimate cost
  const costEstimate = await estimateFalCost(endpoint, quantity);

  const canProceed = currentCredits >= costEstimate.totalCredits;
  const shortfall = canProceed
    ? undefined
    : costEstimate.totalCredits - currentCredits;

  return {
    canProceed,
    costEstimate,
    currentCredits,
    shortfall,
    error: canProceed
      ? undefined
      : `Insufficient credits. You need ${costEstimate.totalCredits} credits but only have ${currentCredits}. Please purchase ${shortfall} more credits.`,
  };
}

/**
 * Records a usage event with Polar - this deducts from the meter balance
 */
export async function recordPolarUsageEvent(
  user: BillingUser,
  costEstimate: CostEstimate,
  metadata: Record<string, string | number> = {},
): Promise<{ success: boolean; error?: string }> {
  if (!user.userId) {
    return { success: false, error: "No user ID provided" };
  }

  try {
    await polar.events.ingest({
      events: [
        {
          name: appConfig.billing.meterSlug,
          externalCustomerId: user.userId,
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
      `[Polar] Recorded usage event for ${user.userId}: ${costEstimate.totalCredits} credits (${costEstimate.endpoint})`,
    );

    return { success: true };
  } catch (error) {
    console.error("Failed to record Polar usage event:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to record usage",
    };
  }
}

/**
 * Process a generation charge - records the event with Polar
 * Polar's meter will automatically deduct from the credit balance
 */
export async function processGenerationCharge(
  user: BillingUser,
  costEstimate: CostEstimate,
  metadata: Record<string, string | number> = {},
): Promise<ChargeResult> {
  // Record the usage event with Polar (this deducts from meter balance)
  const result = await recordPolarUsageEvent(user, costEstimate, metadata);

  if (!result.success) {
    return {
      success: false,
      creditsCharged: 0,
      newBalance: 0,
      costEstimate,
      error: result.error,
    };
  }

  // Get updated balance (optional - for display purposes)
  const newBalance = await getUserCredits(user);

  return {
    success: true,
    creditsCharged: costEstimate.totalCredits,
    newBalance,
    costEstimate,
  };
}

/**
 * Wrapper for billable procedures - validates credits before generation
 * and charges after success
 */
export async function withBilling<T>(
  user: BillingUser,
  endpoint: string,
  useCustomApiKey: boolean,
  generateFn: () => Promise<T>,
  metadata: Record<string, string | number> = {},
): Promise<{ result: T; billing?: ChargeResult }> {
  // Check if user can proceed
  const billingCheck = await checkCreditsForGeneration(
    user,
    endpoint,
    1,
    useCustomApiKey,
  );

  if (!billingCheck.canProceed) {
    throw new Error(billingCheck.error || "Insufficient credits");
  }

  // Execute the generation
  const result = await generateFn();

  // If using custom API key, no billing needed
  if (useCustomApiKey) {
    return { result };
  }

  // Process the charge (record event with Polar)
  const billing = await processGenerationCharge(
    user,
    billingCheck.costEstimate,
    metadata,
  );

  return { result, billing };
}
