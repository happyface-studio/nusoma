"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { Plus, Image } from "lucide-react";
import { useCanvasOperations } from "@/hooks/useCanvasOperations";
import { CanvasCard } from "@/components/dashboard/CanvasCard";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { toastManager } from "@/hooks/use-toast";

export default function Dashboard() {
  const { user } = useAuth();
  const { createCanvas } = useCanvasOperations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const hasShownCheckoutToast = useRef(false);

  // Show success toast when returning from checkout
  useEffect(() => {
    if (
      searchParams.get("checkout") === "success" &&
      !hasShownCheckoutToast.current
    ) {
      hasShownCheckoutToast.current = true;
      // Defer toast to avoid flushSync error during React rendering
      const timeoutId = setTimeout(() => {
        toastManager.add({
          title: "Payment successful!",
          description: "Your credits have been added to your account.",
          type: "success",
        });
      }, 0);
      // Clean up the URL
      router.replace("/dashboard", { scroll: false });
      return () => clearTimeout(timeoutId);
    }
  }, [searchParams, router]);

  // Query all canvas projects with their folders
  const { data, isLoading } = db.useQuery({
    canvasProjects: {
      $: {
        where: { "user.id": user?.id },
        order: { lastModified: "desc" },
      },
      elements: {},
      folder: {},
    },
  });

  const canvasProjects = data?.canvasProjects || [];

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-muted rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-muted rounded w-1/4 mb-8"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-start gap-3">
            <div>
              <h1 className="text-3xl font-bold">All Projects</h1>
              <p className="text-muted-foreground">
                {canvasProjects.length} canvas
                {canvasProjects.length === 1 ? "" : "es"} across all folders
              </p>
            </div>
          </div>
          <Button onClick={createCanvas}>
            <Plus className="h-4 w-4 mr-2" />
            New Canvas
          </Button>
        </div>

        {/* Canvas Projects Section */}
        <div className="mb-8">
          {canvasProjects.length === 0 ? (
            <EmptyState
              icon={Image}
              title="No canvases yet"
              description="Create your first canvas to get started"
              actionLabel="Create Canvas"
              onAction={createCanvas}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {canvasProjects.map((canvas: any) => (
                <CanvasCard key={canvas.id} canvas={canvas} showFolder={true} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
