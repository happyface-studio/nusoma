// FAL Pricing Estimate Utility

import { appConfig } from "./config";

interface PricingEstimateRequest {
  estimate_type: "unit_price" | "historical_api_price";
  endpoints: {
    [endpoint: string]: {
      unit_quantity?: number;
      call_quantity?: number;
    };
  };
}

interface PricingEstimateResponse {
  estimate_type: string;
  total_cost: number;
  currency: string;
}

export interface CostEstimate {
  /** Raw FAL cost in USD */
  falCost: number;
  /** Margin amount in USD */
  marginAmount: number;
  /** Total cost in USD (FAL + margin) */
  totalCostUsd: number;
  /** Total cost in credits */
  totalCredits: number;
  /** The endpoint used for estimation */
  endpoint: string;
}

/**
 * Estimates the cost for a FAL API call
 * @param endpoint - The FAL endpoint (e.g., "fal-ai/flux/dev")
 * @param quantity - Number of units (images/videos) to generate
 * @returns Cost estimate including FAL cost, margin, and total in credits
 */
export async function estimateFalCost(
  endpoint: string,
  quantity: number = 1,
): Promise<CostEstimate> {
  const request: PricingEstimateRequest = {
    estimate_type: appConfig.fal.estimateType,
    endpoints: {
      [endpoint]: {
        unit_quantity: quantity,
      },
    },
  };

  const response = await fetch(
    "https://api.fal.ai/v1/models/pricing/estimate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${process.env.FAL_KEY}`,
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("FAL pricing API error:", response.status, errorText);
    throw new Error(`Failed to estimate FAL pricing: ${response.status}`);
  }

  const data: PricingEstimateResponse = await response.json();

  const falCost = data.total_cost;
  const marginAmount = falCost * appConfig.billing.marginPercentage;
  const totalCostUsd = falCost + marginAmount;

  // Convert USD to credits (1 credit = $0.01)
  let totalCredits = Math.ceil(
    totalCostUsd / appConfig.billing.creditToUsdRate,
  );

  // Apply minimum charge
  totalCredits = Math.max(totalCredits, appConfig.billing.minimumCharge);

  return {
    falCost,
    marginAmount,
    totalCostUsd,
    totalCredits,
    endpoint,
  };
}

/**
 * Estimates cost for multiple endpoints in a single request
 * @param endpoints - Map of endpoint to quantity
 * @returns Combined cost estimate
 */
export async function estimateMultipleFalCosts(
  endpoints: Record<string, number>,
): Promise<CostEstimate & { breakdown: Record<string, number> }> {
  const request: PricingEstimateRequest = {
    estimate_type: appConfig.fal.estimateType,
    endpoints: Object.fromEntries(
      Object.entries(endpoints).map(([endpoint, quantity]) => [
        endpoint,
        { unit_quantity: quantity },
      ]),
    ),
  };

  const response = await fetch(
    "https://api.fal.ai/v1/models/pricing/estimate",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${process.env.FAL_KEY}`,
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("FAL pricing API error:", response.status, errorText);
    throw new Error(`Failed to estimate FAL pricing: ${response.status}`);
  }

  const data: PricingEstimateResponse = await response.json();

  const falCost = data.total_cost;
  const marginAmount = falCost * appConfig.billing.marginPercentage;
  const totalCostUsd = falCost + marginAmount;

  let totalCredits = Math.ceil(
    totalCostUsd / appConfig.billing.creditToUsdRate,
  );
  totalCredits = Math.max(totalCredits, appConfig.billing.minimumCharge);

  return {
    falCost,
    marginAmount,
    totalCostUsd,
    totalCredits,
    endpoint: Object.keys(endpoints).join(", "),
    breakdown: endpoints,
  };
}
