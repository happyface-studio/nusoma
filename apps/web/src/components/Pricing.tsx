import { CreditCardIcon, GithubLogoIcon } from "@phosphor-icons/react";
import { Button } from "./ui/button";
import Link from "next/link";

export default function Pricing({ userId }: { userId: string }) {
  return (
    <div className="max-w-2xl grid grid-cols-2 gap-4 mx-auto p-8">
      <div className="bg-sage-2 p-4 rounded-lg border border-sage-4 flex flex-col justify-between gap-2">
        <h2 className="text-lg font-medium text-sage-12">Free Forever</h2>
        <p className="text-sm text-sage-11">
          nusoma is fully open source so you can host your own instance for
          free. forever.
        </p>
        <Link href="https://github.com/simonweniger/nusoma" target="_blank">
          <Button
            size="sm"
            className="bg-sage-4 mt-auto hover:bg-sage-5 text-sage-12 border border-sage-6"
          >
            <GithubLogoIcon size={8} weight="bold" />
            View on GitHub
          </Button>
        </Link>
      </div>

      <div className="bg-sage-2 p-4 rounded-lg border border-sage-4 flex flex-col justify-between gap-2">
        <div className="flex flex-row justify-between">
          <h2 className="text-lg font-medium text-sage-12">Essential</h2>
          <h2 className="text-xl font-medium text-sage-12">$10</h2>
        </div>

        <p className="text-sm text-sage-11">
          Access to all models. Unlimited conversations.{" "}
          <span className="font-medium text-sage-12">1000 credits.</span>
        </p>

        <Link
          href={
            process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK +
            "?client_reference_id=" +
            userId
          }
          target="_blank"
        >
          <Button
            size="sm"
            className="bg-sage-4 mt-auto hover:bg-sage-5 text-sage-12 border border-sage-6"
          >
            <CreditCardIcon size={8} weight="bold" />
            Buy Now
          </Button>
        </Link>
      </div>
    </div>
  );
}
