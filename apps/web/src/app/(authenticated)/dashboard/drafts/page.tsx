"use client";

import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { useRouter } from "next/navigation";
import { Plus, Image } from "lucide-react";
import { useCanvasOperations } from "@/hooks/useCanvasOperations";
import { CanvasCard } from "@/components/dashboard/CanvasCard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export default function DraftsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { createCanvas } = useCanvasOperations();

  // Query canvas projects without folders
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

  // Filter out projects that have a folder
  const canvasProjects = (data?.canvasProjects || []).filter(
    (project: any) => !project.folder,
  );

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
              <h1 className="text-3xl font-bold">Drafts</h1>
              <p className="text-muted-foreground">
                {canvasProjects.length} canvas
                {canvasProjects.length === 1 ? "" : "es"} without a folder
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
              title="No draft canvases"
              description="Create a new canvas or move canvases here by removing them from folders"
              actionLabel="Create Canvas"
              onAction={createCanvas}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {canvasProjects.map((canvas: any) => (
                <CanvasCard key={canvas.id} canvas={canvas} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
