"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useState } from "react";
import {
  CreditCardIcon,
  DiamondsFourIcon,
  SpinnerIcon,
  XIcon,
} from "@phosphor-icons/react";
import NumberFlow from "@number-flow/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Link from "next/link";
import { useTRPC } from "@/trpc/client";
import { useQuery, useMutation } from "@tanstack/react-query";

interface CreditPackage {
  id: string;
  name: string;
  description: string | null;
  priceAmount: number;
  priceCurrency: string;
  credits: number;
}

export default function PlansDialog() {
  const { db, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

  const url = db.auth.createAuthorizationURL({
    clientName: "google-web",
    redirectURL: window.location.href,
  });

  const trpc = useTRPC();

  // Fetch credit packages from Polar
  const {
    data: packages,
    isLoading: packagesLoading,
    error: packagesError,
  } = useQuery(
    trpc.getCreditPackages.queryOptions(undefined, {
      enabled: isOpen,
    }),
  );

  // Create checkout session mutation
  const createCheckout = useMutation(
    trpc.createCheckoutSession.mutationOptions({
      onSuccess: (data) => {
        // Redirect to Polar's hosted checkout
        window.location.href = data.checkoutUrl;
      },
      onError: (error) => {
        console.error("Failed to create checkout:", error);
        setIsCheckoutLoading(false);
      },
    }),
  );

  const handleSelectPackage = async (pkg: CreditPackage) => {
    if (!user) return;

    setIsCheckoutLoading(true);

    createCheckout.mutate({
      productId: pkg.id,
      userId: user.id,
      userEmail: user.email,
    });
  };

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / 100);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        render={(props) => (
          <Button size="sm" variant="outline" {...props}>
            <CreditCardIcon
              size={8}
              className="text-sage-12 group-hover:text-sage-12 transition-colors duration-300"
            />
            Add Credits
          </Button>
        )}
      />
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-12 font-medium text-md">
            Purchase Credits
          </DialogTitle>
          <DialogDescription className="text-gray-11 text-sm">
            Select a credit package to continue.
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          // Sign in prompt
          <div className="flex flex-col items-center gap-4 py-8">
            <p className="text-gray-11 text-sm text-center">
              Please sign in to purchase credits.
            </p>
            <Link href={url}>
              <Button>Sign In With Google</Button>
            </Link>
          </div>
        ) : isCheckoutLoading ? (
          // Loading state
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <SpinnerIcon size={32} className="animate-spin text-gray-11" />
            <p className="text-gray-11 text-sm">Redirecting to checkout...</p>
          </div>
        ) : packagesLoading ? (
          // Loading packages
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <SpinnerIcon size={32} className="animate-spin text-gray-11" />
            <p className="text-gray-11 text-sm">Loading credit packages...</p>
          </div>
        ) : packagesError ? (
          // Error state
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <XIcon size={32} className="text-red-500" />
            <p className="text-gray-11 text-sm">Failed to load packages</p>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Close
            </Button>
          </div>
        ) : packages && packages.length > 0 ? (
          // Package selection
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {packages.map((pkg: CreditPackage) => (
                <div
                  key={pkg.id}
                  className={`
                    relative flex flex-col gap-3 p-4 rounded-lg border cursor-pointer
                    transition-all duration-200 hover:border-primary hover:shadow-md border-border
                  `}
                  onClick={() => handleSelectPackage(pkg)}
                >
                  <div className="flex flex-col gap-1">
                    <h3 className="font-semibold text-gray-12">{pkg.name}</h3>
                    {pkg.description && (
                      <p className="text-xs text-gray-11 line-clamp-2">
                        {pkg.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-gray-12">
                      {formatPrice(pkg.priceAmount, pkg.priceCurrency)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm text-gray-11">
                    <DiamondsFourIcon
                      size={16}
                      weight="fill"
                      className="text-teal-9"
                    />
                    <NumberFlow
                      value={pkg.credits}
                      className="font-medium text-gray-12"
                    />
                    <span>credits</span>
                  </div>

                  <div className="text-xs text-gray-10">
                    {((pkg.priceAmount / 100 / pkg.credits) * 1000).toFixed(2)}$
                    per 1,000 credits
                  </div>
                </div>
              ))}
            </div>

            <p className="text-gray-10 text-xs text-center mt-2">
              nusoma is fully open source. You can also use it for free by{" "}
              <a
                href="https://github.com/simonweniger/nusoma"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-12 hover:underline"
              >
                hosting it yourself
              </a>
              .
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-gray-11 text-sm">No credit packages available</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
