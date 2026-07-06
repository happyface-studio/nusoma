import MarketingLayout from "@/components/landing/marketing-layout";
import { CTA } from "@/components/landing/sections/cta";
import { FAQ } from "@/components/landing/sections/faq";
import { Hero } from "@/components/landing/sections/hero";
import { Logos } from "@/components/landing/sections/logos";
import { Problem } from "@/components/landing/sections/problem";
import { Solution } from "@/components/landing/sections/solution";
import { Stats } from "@/components/landing/sections/stats";
import { Testimonials } from "@/components/landing/sections/testimonials";

export default function HomePage() {
  return (
    <MarketingLayout>
      <Hero />
      <Logos />
      <Problem />
      <Solution />
      <Stats />
      {/* <Testimonials /> */}
      <FAQ />
      <CTA />
    </MarketingLayout>
  );
}
