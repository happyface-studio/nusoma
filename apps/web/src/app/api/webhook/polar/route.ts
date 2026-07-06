import { Webhooks } from "@polar-sh/nextjs";
import { db } from "@/lib/instant-admin";

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

  /**
   * Handle successful order payment
   * This is triggered when a customer completes a credit package purchase.
   * Note: Credits are automatically added by Polar's Credits Benefit to the meter balance.
   * This webhook just marks the user as having purchased credits for UI purposes.
   */
  onOrderPaid: async (payload) => {
    console.log("[Polar Webhook] Order paid:", payload.data.id);

    const order = payload.data;

    // Get the customer's external ID (our user ID)
    // First try customer.externalId, then fall back to customer.metadata.externalId
    const userId =
      order.customer?.externalId ||
      (order.customer?.metadata as Record<string, unknown>)?.externalId;

    if (!userId || typeof userId !== "string") {
      console.error("[Polar Webhook] No external customer ID found in order");
      console.log("[Polar Webhook] Customer data:", order.customer);
      return;
    }

    // Get credits from product metadata for logging
    const product = order.product;
    const credits = product
      ? (product.metadata as Record<string, unknown>)?.credits
      : null;

    console.log(
      `[Polar Webhook] Order paid for user ${userId}${credits ? ` - ${credits} credits purchased` : ""}`,
    );

    try {
      // Get the user's current profile
      const result = await db.query({
        userProfiles: {
          $: {
            where: {
              "user.id": userId,
            },
          },
        },
      });

      const profile = result.userProfiles?.[0];

      if (!profile) {
        console.error(
          `[Polar Webhook] User profile not found for user ${userId}`,
        );
        return;
      }

      // Mark user as having purchased credits (credits are managed by Polar's meter system)
      await db.transact(
        db.tx.userProfiles[profile.id].update({
          externalCustomerId: order.customer?.id,
        }),
      );

      console.log(
        `[Polar Webhook] Marked user ${userId} as having purchased credits`,
      );
    } catch (error) {
      console.error("[Polar Webhook] Failed to update user profile:", error);
      throw error; // Re-throw to trigger webhook retry
    }
  },

  /**
   * Handle order creation (optional - for logging/tracking)
   */
  onOrderCreated: async (payload) => {
    console.log("[Polar Webhook] Order created:", payload.data.id);
  },

  /**
   * Handle customer state changes (optional - for syncing customer data)
   */
  onCustomerStateChanged: async (payload) => {
    console.log(
      "[Polar Webhook] Customer state changed:",
      payload.data.externalId,
    );
  },

  /**
   * Catch-all handler for debugging
   */
  onPayload: async (payload) => {
    console.log("[Polar Webhook] Received event:", payload.type);
  },
});
