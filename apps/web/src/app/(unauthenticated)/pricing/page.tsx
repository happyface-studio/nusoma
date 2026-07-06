import * as React from "react";
import type { Metadata } from "next";

import { PricingFAQ } from "@/components/landing/sections/pricing-faq";
import { PricingHero } from "@/components/landing/sections/pricing-hero";
import { createTitle } from "@/lib/formatters";

export const metadata: Metadata = {
  title: createTitle("Pricing"),
};

export default function PricingPage(): React.JSX.Element {
  return (
    <>
      <PricingHero />
      <PricingFAQ />
    </>
  );
}
