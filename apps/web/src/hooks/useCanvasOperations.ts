import { useAuth } from "@/providers/auth-provider";
import { db } from "@/lib/db";
import { id } from "@instantdb/react";
import { useRouter } from "next/navigation";

interface UseCanvasOperationsOptions {
  folderId?: string;
}

export function useCanvasOperations(options: UseCanvasOperationsOptions = {}) {
  const { user } = useAuth();
  const router = useRouter();
  const { folderId } = options;

  const createCanvas = async () => {
    if (!user) {
      console.error("No user found - cannot create canvas");
      return;
    }

    try {
      const projectId = id();
      const txs = [
        db.tx.canvasProjects[projectId].update({
          name: "Untitled Canvas",
          viewportX: 0,
          viewportY: 0,
          viewportScale: 1,
          lastModified: new Date(),
        }),
        db.tx.canvasProjects[projectId].link({ user: user.id }),
      ];

      // Link to folder if folderId is provided
      if (folderId) {
        txs.push(db.tx.canvasProjects[projectId].link({ folder: folderId }));
      }
      await db.transact(txs);
      const verifyResult = await db.queryOnce({
        canvasProjects: {
          $: {
            where: {
              id: projectId,
              "user.id": user.id,
            },
          },
          user: {}, // Include user to verify the link
        },
      });

      if (verifyResult.data.canvasProjects.length === 0) {
        console.error(
          "❌ [CREATE] Project was not created successfully or not linked to user",
        );
        console.error("❌ [CREATE] User ID:", user.id);
        console.error("❌ [CREATE] Project ID:", projectId);
        throw new Error("Failed to create canvas project");
      }

      const project = verifyResult.data.canvasProjects[0];

      if (!project.user) {
        throw new Error("Canvas project not properly linked to user");
      }
      // Navigate to the new canvas
      router.push(`/canvas/${projectId}`);
    } catch (error) {
      console.error("Error creating canvas:", error);
      alert("Failed to create canvas. Please try again.");
    }
  };

  const deleteCanvas = async (projectId: string) => {
    try {
      console.log(`[DELETE] Starting deletion of canvas ${projectId}...`);

      // Get all elements and their assets for this project
      const result = await db.queryOnce({
        canvasElements: {
          $: {
            where: { "project.id": projectId },
          },
          asset: {
            file: {},
          },
        },
      });

      const assetIds = new Set<string>();
      const filePaths = new Set<string>();

      result.data.canvasElements.forEach((el: any) => {
        if (el.asset) {
          assetIds.add(el.asset.id);
          if (el.asset.file?.path) {
            filePaths.add(el.asset.file.path);
          }
        }
      });

      // Check which assets will be orphaned
      const assetsCheck = await db.queryOnce({
        canvasAssets: {
          $: {
            where: { id: { $in: Array.from(assetIds) } },
          },
          elements: {},
          file: {},
        },
      });

      const orphanedAssets = assetsCheck.data.canvasAssets.filter(
        (asset: any) => {
          if (!asset.elements || asset.elements.length === 0) return true;
          return asset.elements.every((el: any) =>
            result.data.canvasElements.some(
              (projectEl: any) => projectEl.id === el.id,
            ),
          );
        },
      );

      // Build delete transaction
      const deleteTxs = [
        ...orphanedAssets.map((asset: any) =>
          db.tx.canvasAssets[asset.id].delete(),
        ),
        ...result.data.canvasElements.map((el: any) =>
          db.tx.canvasElements[el.id].delete(),
        ),
        db.tx.canvasProjects[projectId].delete(),
      ];

      // Execute transaction
      await db.transact(deleteTxs);

      // Delete storage files in parallel
      if (orphanedAssets.length > 0 && filePaths.size > 0) {
        const storageDeletePromises = Array.from(filePaths).map(
          async (filePath: string) => {
            try {
              await db.storage.delete(filePath);
              return { success: true, filePath };
            } catch (error) {
              console.error(`Failed to delete file ${filePath}:`, error);
              return { success: false, filePath, error };
            }
          },
        );
        await Promise.allSettled(storageDeletePromises);
      }

      console.log(`[DELETE] Successfully deleted canvas ${projectId}`);
    } catch (error) {
      console.error("[DELETE] Error deleting canvas:", error);
      alert("Failed to delete canvas. Please try again.");
      throw error;
    }
  };

  return {
    createCanvas,
    deleteCanvas,
  };
}
