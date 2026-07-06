export const appConfig = {
  info: {
    name: "nusoma",
    description: "A powerful AI image and video generation platform.",
    supportEmail: "support@nusoma.com",
    contactEmail: "hello@nusoma.com",
    startUrl: "/",
    display: "standalone",
    backgroundColor: "#000000",
    themeColor: "#000000",
  },
  billing: {
    /**
     * Margin percentage added on top of FAL costs
     * Example: 0.20 = 20% margin
     */
    marginPercentage: 0.2,

    /**
     * Minimum charge per generation (in credits/cents)
     * Prevents very small charges that are impractical
     */
    minimumCharge: 1,

    /**
     * Credit to USD conversion rate
     * 1 credit = $0.01 (1 cent)
     */
    creditToUsdRate: 0.01,

    /**
     * Polar Meter Slug for recording usage
     */
    meterSlug: "₦ credit usage",
  },

  /**
   * FAL API Configuration
   */
  fal: {
    /**
     * Default estimate type for pricing calculations
     * "unit_price" - Calculate based on billing units (images, videos)
     */
    estimateType: "unit_price" as const,
  },

  agent: {
    runCreditCap: 50, // max credits a single agent run may spend; server-enforced
  },
} as const;

export type AppConfig = typeof appConfig;
export type BillingConfig = typeof appConfig.billing;
