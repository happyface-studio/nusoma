"use client";

import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { useRouter, useParams } from "next/navigation";
import { Plus, Image, Settings } from "lucide-react";
import { useState } from "react";
import FolderDialog from "@/components/dashboard/FolderDialog";
import FolderSettingsDialog from "@/components/dashboard/FolderSettingsDialog";
import { useCanvasOperations } from "@/hooks/useCanvasOperations";
import { CanvasCard } from "@/components/dashboard/CanvasCard";
import { EmptyState } from "@/components/dashboard/EmptyState";

export default function FolderPage() {
  const router = useRouter();
  const params = useParams();
  const folderId = params.id as string;

  const [isFolderDialogOpen, setIsFolderDialogOpen] = useState(false);
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);

  const { createCanvas } = useCanvasOperations({ folderId });

  // Query the specific folder with its projects
  const { data, isLoading } = db.useQuery({
    folders: {
      $: {
        where: { id: folderId },
      },
      projects: {
        elements: {},
      },
    },
  });

  const folder = data?.folders?.[0];
  const canvasProjects = folder?.projects || [];

  const handleRenameFolder = async (name: string) => {
    if (!folder) return;

    await db.transact([db.tx.folders[folderId].update({ name })]);
    setIsFolderDialogOpen(false);
  };

  const handleDeleteFolder = async () => {
    if (!folder) return;

    if (
      !confirm(
        "Delete this folder? All canvases will be moved to Drafts. This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      // Unlink all projects from this folder
      if (folder.projects && folder.projects.length > 0) {
        const unlinkTxs = folder.projects.map((project: any) =>
          db.tx.canvasProjects[project.id].unlink({ folder: folderId }),
        );
        await db.transact(unlinkTxs);
      }

      // Delete the folder
      await db.transact([db.tx.folders[folderId].delete()]);

      // Navigate back to dashboard
      router.push("/dashboard");
    } catch (error) {
      console.error("Error deleting folder:", error);
    }
  };

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

  if (!folder) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold mb-2">Folder not found</h2>
            <p className="text-muted-foreground mb-4">
              This folder doesn&apos;t exist or you don&apos;t have access to
              it.
            </p>
            <Button onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Folder Header */}
        <div className="flex justify-between items-start mb-8">
          <div className="flex items-start gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{folder.name}</h1>
              <p className="text-muted-foreground">
                {canvasProjects.length} canvas
                {canvasProjects.length === 1 ? "" : "es"} in this folder
              </p>
            </div>
          </div>

          {/* Action Panel */}
          <div className="flex items-center gap-2">
            <Button onClick={createCanvas} className="gap-2">
              <Plus className="h-4 w-4" />
              Create
            </Button>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setIsSettingsDialogOpen(true)}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Canvas Projects Section */}
        <div className="mb-8">
          {canvasProjects.length === 0 ? (
            <EmptyState
              icon={Image}
              title="No canvases in this folder"
              description="Create your first canvas in this folder"
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

      {/* Rename Folder Dialog */}
      <FolderDialog
        isOpen={isFolderDialogOpen}
        onClose={() => setIsFolderDialogOpen(false)}
        onSubmit={handleRenameFolder}
        initialName={folder.name}
        mode="rename"
      />

      {/* Settings Dialog */}
      <FolderSettingsDialog
        isOpen={isSettingsDialogOpen}
        onClose={() => setIsSettingsDialogOpen(false)}
        onRename={handleRenameFolder}
        onDelete={handleDeleteFolder}
        initialName={folder.name}
      />
    </div>
  );
}
