import { db } from "./db";
import { id } from "@instantdb/react";
import type {
  CanvasProject,
  CanvasElement as SchemaCanvasElement,
  CanvasAsset,
  CanvasAssetWithFile,
  CanvasProjectWithElements,
  CanvasElementWithAsset,
} from "../instant.schema";

// Helper types for query results
interface CanvasProjectsQueryData {
  canvasProjects: CanvasProject[];
}

interface CanvasProjectsWithElementsQueryData {
  canvasProjects: CanvasProjectWithElements[];
}

interface CanvasElementsQueryData {
  canvasElements: SchemaCanvasElement[];
}

interface CanvasElementsWithAssetQueryData {
  canvasElements: CanvasElementWithAsset[];
}

interface CanvasAssetsQueryData {
  canvasAssets: CanvasAsset[];
}

interface CanvasAssetsWithFileQueryData {
  canvasAssets: CanvasAssetWithFile[];
}

interface CanvasImage {
  id: string;
  originalDataUrl: string;
  uploadedUrl?: string;
  createdAt: number;
}

interface ImageTransform {
  scale: number;
  x: number;
  y: number;
  rotation: number;
  cropBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface CanvasElement {
  id: string;
  type: "image" | "text" | "shape" | "video";
  imageId?: string;
  videoId?: string;
  transform: ImageTransform;
  zIndex: number;
  width?: number;
  height?: number;
  // Video-specific properties
  duration?: number;
  currentTime?: number;
  isPlaying?: boolean;
  volume?: number;
  muted?: boolean;
}

export interface CanvasState {
  elements: CanvasElement[];
  backgroundColor?: string;
  lastModified: number;
  viewport?: {
    x: number;
    y: number;
    scale: number;
  };
}

interface CanvasVideo {
  id: string;
  originalDataUrl: string;
  uploadedUrl?: string;
  duration: number;
  createdAt: number;
}

class InstantCanvasStorage {
  private userId: string | null = null;
  private sessionId: string | null = null;
  private currentProjectId: string | null = null;

  // Map to store data URLs temporarily (before upload)
  private imageDataUrls: Map<string, string> = new Map();
  private videoDataUrls: Map<string, string> = new Map();

  /**
   * Initialize storage with user or session ID
   */
  setUser(userId: string | null, sessionId: string | null) {
    this.userId = userId;
    this.sessionId = sessionId;
  }

  /**
   * Set the current project ID (for loading a specific project)
   */
  setCurrentProject(projectId: string) {
    this.currentProjectId = projectId;
  }

  /**
   * Get or create the current project
   */
  private async getCurrentProject() {
    if (this.currentProjectId) {
      const result = await db.queryOnce({
        canvasProjects: {
          $: {
            where: {
              id: this.currentProjectId,
            },
          },
        },
      });

      if (result.data.canvasProjects.length > 0) {
        return this.currentProjectId;
      } else {
        // After all retries, throw an error instead of creating a new project
        // This prevents overwriting a project that was just created elsewhere
        console.error(
          `❌ [STORAGE] Project ${this.currentProjectId} not found after all retries`,
        );
        throw new Error(
          `Project ${this.currentProjectId} not found after retries. It may not exist or you may not have access to it.`,
        );
      }
    }

    // Query for existing project
    const whereClause = this.userId
      ? { "user.id": this.userId }
      : this.sessionId
        ? { sessionId: this.sessionId }
        : undefined;

    if (!whereClause) {
      throw new Error("No user ID or session ID set");
    }

    const result = await db.queryOnce({
      canvasProjects: {
        $: {
          where: whereClause,
          limit: 1,
        },
      },
    });

    const { canvasProjects: projects } = result.data as CanvasProjectsQueryData;
    if (projects && projects.length > 0) {
      this.currentProjectId = projects[0].id;
      return this.currentProjectId;
    }

    // Create new project
    const projectId = id();
    const txs = [
      db.tx.canvasProjects[projectId].update({
        name: "Untitled Canvas",
        viewportX: 0,
        viewportY: 0,
        viewportScale: 1,
        lastModified: new Date(),
        ...(this.sessionId && { sessionId: this.sessionId }),
      }),
    ];

    if (this.userId) {
      txs.push(db.tx.canvasProjects[projectId].link({ user: this.userId }));
    }

    await db.transact(txs);
    this.currentProjectId = projectId;
    return projectId;
  }

  /**
   * Save an image to InstantDB storage
   */
  async saveImage(
    dataUrl: string,
    imageId?: string,
    metadata?: {
      prompt?: string;
      creditsConsumed?: number;
      referencedAssetIds?: string[];
    },
  ): Promise<string> {
    const assetId = imageId || id();

    // Store data URL temporarily
    this.imageDataUrls.set(assetId, dataUrl);

    try {
      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Upload to InstantDB storage
      const path = `canvas-images/${this.userId || this.sessionId}/${assetId}`;

      console.log(`[STORAGE] Uploading image ${assetId} to path: ${path}`);

      // Convert blob to File
      const file = new File([blob], `${assetId}.png`, { type: blob.type });

      // Upload returns { data: { id, path } }
      const { data: fileData } = await db.storage.uploadFile(path, file);

      // Create asset record and link to the file
      // CRITICAL: Always link asset to user for proper permission checks
      if (!this.userId && !this.sessionId) {
        throw new Error("Cannot save asset: no user or session ID");
      }

      const txs = [
        db.tx.canvasAssets[assetId]
          .update({
            type: "image",
            createdAt: new Date(),
            ...(metadata?.prompt && { prompt: metadata.prompt }),
            ...(metadata?.creditsConsumed !== undefined && {
              creditsConsumed: metadata.creditsConsumed,
            }),
          })
          .link({ file: fileData.id }),
      ];

      // Always link to user if authenticated
      if (this.userId) {
        txs.push(db.tx.canvasAssets[assetId].link({ user: this.userId }));
      }

      await db.transact(txs);

      // Clear temporary storage now that upload is successful
      this.imageDataUrls.delete(assetId);

      return assetId;
    } catch (error) {
      console.error(`[STORAGE] Failed to save image ${assetId}:`, error);
      // Keep in temporary storage if upload fails
      return assetId;
    }
  }

  /**
   * Get an image from InstantDB
   */
  async getImage(assetId: string): Promise<CanvasImage | undefined> {
    // Check temporary storage first
    const dataUrl = this.imageDataUrls.get(assetId);
    if (dataUrl) {
      return {
        id: assetId,
        originalDataUrl: dataUrl,
        createdAt: Date.now(),
      };
    }

    try {
      const result = await db.queryOnce({
        canvasAssets: {
          $: {
            where: {
              id: assetId,
              type: "image",
            },
          },
          file: {}, // Query the linked file to get the URL
        },
      });

      const asset = result.data.canvasAssets[0];

      if (!asset) {
        console.warn(`Asset ${assetId} not found`);
        return undefined;
      }

      if (!asset.file) {
        console.warn(`Asset ${assetId} is missing file`);
        return undefined;
      }

      return {
        id: asset.id,
        originalDataUrl: asset.file.url,
        uploadedUrl: asset.file.url,
        createdAt: asset.createdAt
          ? new Date(asset.createdAt).getTime()
          : Date.now(),
      };
    } catch (error) {
      console.error("Failed to get image:", error);
      return undefined;
    }
  }

  /**
   * Delete an image
   */
  async deleteImage(assetId: string): Promise<void> {
    this.imageDataUrls.delete(assetId);

    try {
      // Get the asset to find the file path
      const result = await db.queryOnce({
        canvasAssets: {
          $: { where: { id: assetId } },
          file: {},
        },
      });

      const asset = result.data.canvasAssets[0];
      if (asset?.file) {
        // Delete the actual file from storage
        await db.storage.delete(asset.file.path);
      }

      // Delete the asset record (this will also remove the link to the file)
      await db.transact(db.tx.canvasAssets[assetId].delete());
    } catch (error) {
      console.error("Failed to delete image:", error);
    }
  }

  /**
   * Save a video to InstantDB storage
   */
  async saveVideo(
    videoDataUrl: string,
    duration: number,
    videoId?: string,
    metadata?: {
      prompt?: string;
      creditsConsumed?: number;
      referencedAssetIds?: string[];
    },
  ): Promise<string> {
    const assetId = videoId || id();

    // Store data URL temporarily
    this.videoDataUrls.set(assetId, videoDataUrl);

    try {
      // Convert data URL to blob
      const response = await fetch(videoDataUrl);
      const blob = await response.blob();

      // Upload to InstantDB storage
      const path = `canvas-videos/${this.userId || this.sessionId}/${assetId}`;

      // Convert blob to File
      const file = new File([blob], `${assetId}.mp4`, { type: blob.type });

      // Upload returns { data: { id, path } }
      const { data: fileData } = await db.storage.uploadFile(path, file);

      // Create asset record and link to the file
      // CRITICAL: Always link asset to user for proper permission checks
      if (!this.userId && !this.sessionId) {
        throw new Error("Cannot save asset: no user or session ID");
      }

      const txs = [
        db.tx.canvasAssets[assetId]
          .update({
            type: "video",
            duration,
            createdAt: new Date(),
            ...(metadata?.prompt && { prompt: metadata.prompt }),
          })
          .link({ file: fileData.id }),
      ];

      // Always link to user if authenticated
      if (this.userId) {
        txs.push(db.tx.canvasAssets[assetId].link({ user: this.userId }));
      }

      // Link to referenced assets (lineage)
      if (
        metadata?.referencedAssetIds &&
        metadata.referencedAssetIds.length > 0
      ) {
        metadata.referencedAssetIds.forEach((refId) => {
          txs.push(
            db.tx.canvasAssets[assetId].link({ referencedAssets: refId }),
          );
        });
      }

      await db.transact(txs);

      // Remove from temporary storage
      this.videoDataUrls.delete(assetId);

      return assetId;
    } catch (error) {
      console.error("Failed to save video:", error);
      // Keep in temporary storage if upload fails
      return assetId;
    }
  }

  /**
   * Get a video from InstantDB
   */
  async getVideo(assetId: string): Promise<CanvasVideo | undefined> {
    // Check temporary storage first
    const dataUrl = this.videoDataUrls.get(assetId);
    if (dataUrl) {
      return {
        id: assetId,
        originalDataUrl: dataUrl,
        duration: 0, // Will be updated when video loads
        createdAt: Date.now(),
      };
    }

    try {
      const result = await db.queryOnce({
        canvasAssets: {
          $: {
            where: {
              id: assetId,
              type: "video",
            },
          },
          file: {}, // Query the linked file to get the URL
        },
      });

      const asset = result.data.canvasAssets[0];
      if (!asset) return undefined;
      if (!asset.file) return undefined;

      return {
        id: asset.id,
        originalDataUrl: asset.file.url,
        uploadedUrl: asset.file.url,
        duration: asset.duration || 0,
        createdAt: asset.createdAt
          ? new Date(asset.createdAt).getTime()
          : Date.now(),
      };
    } catch (error) {
      console.error("Failed to get video:", error);
      return undefined;
    }
  }

  /**
   * Delete a video
   */
  async deleteVideo(assetId: string): Promise<void> {
    this.videoDataUrls.delete(assetId);

    try {
      // Get the asset to find the file path
      const result = await db.queryOnce({
        canvasAssets: {
          $: { where: { id: assetId } },
          file: {},
        },
      });

      const asset = result.data.canvasAssets[0];
      if (asset?.file) {
        // Delete the actual file from storage
        await db.storage.delete(asset.file.path);
      }

      // Delete the asset record (this will also remove the link to the file)
      await db.transact(db.tx.canvasAssets[assetId].delete());
    } catch (error) {
      console.error("Failed to delete video:", error);
    }
  }

  /**
   * Save canvas state to InstantDB
   */
  async saveCanvasState(state: CanvasState): Promise<void> {
    try {
      const projectId = await this.getCurrentProject();
      if (!projectId) {
        throw new Error("No project ID available");
      }

      // Update project viewport and metadata
      await db.transact([
        db.tx.canvasProjects[projectId].update({
          backgroundColor: state.backgroundColor,
          viewportX: state.viewport?.x || 0,
          viewportY: state.viewport?.y || 0,
          viewportScale: state.viewport?.scale || 1,
          lastModified: new Date(state.lastModified),
        }),
      ]);

      // Query existing elements
      const existingElements = await db.queryOnce({
        canvasElements: {
          $: {
            where: {
              "project.id": projectId as string,
            },
          },
        },
      });

      const { canvasElements } =
        existingElements.data as CanvasElementsQueryData;
      const elements = canvasElements || [];
      const existingIds = new Set(elements.map((element) => element.id));
      const newElementIds = new Set(
        state.elements.map((element) => element.id),
      );

      // Delete elements that are no longer in the state
      const deleteTxs = elements
        .filter((element) => !newElementIds.has(element.id))
        .map((element) => db.tx.canvasElements[element.id].delete());

      if (deleteTxs.length > 0) {
        await db.transact(deleteTxs);
      }

      // Update or create elements
      const elementTxs = state.elements.flatMap((element) => {
        const elementId = element.id;
        const exists = existingIds.has(elementId);

        // Build update transaction
        const updateTx = db.tx.canvasElements[elementId].update({
          type: element.type,
          x: element.transform.x,
          y: element.transform.y,
          width: element.width,
          height: element.height,
          rotation: element.transform.rotation,
          scale: element.transform.scale,
          zIndex: element.zIndex,
          cropX: element.transform.cropBox?.x,
          cropY: element.transform.cropBox?.y,
          cropWidth: element.transform.cropBox?.width,
          cropHeight: element.transform.cropBox?.height,
          duration: element.duration,
          currentTime: element.currentTime,
          isPlaying: element.isPlaying,
          volume: element.volume,
          muted: element.muted,
        });

        const txs: any[] = [updateTx];

        // Link to project if this is a new element
        if (!exists && projectId) {
          txs.push(
            db.tx.canvasElements[elementId].link({ project: projectId }),
          );
        }

        // Always ensure asset link is present (for both new and existing elements)
        if (element.imageId) {
          txs.push(
            db.tx.canvasElements[elementId].link({ asset: element.imageId }),
          );
        } else if (element.videoId) {
          txs.push(
            db.tx.canvasElements[elementId].link({ asset: element.videoId }),
          );
        }

        return txs;
      });

      if (elementTxs.length > 0) {
        await db.transact(elementTxs);
      }
    } catch (error) {
      console.error("Failed to save canvas state:", error);
      throw error;
    }
  }

  /**
   * Get canvas state from InstantDB
   */
  async getCanvasState(): Promise<CanvasState | null> {
    try {
      // If we have a specific project ID, use it
      const whereClause = this.currentProjectId
        ? { id: this.currentProjectId }
        : this.userId
          ? { "user.id": this.userId }
          : this.sessionId
            ? { sessionId: this.sessionId }
            : undefined;

      if (!whereClause) {
        console.log("No where clause - no user or session ID set");
        return null;
      }

      console.log("Querying canvas state with:", {
        currentProjectId: this.currentProjectId,
        userId: this.userId,
        sessionId: this.sessionId,
        whereClause,
      });

      const result = await db.queryOnce(
        {
          canvasProjects: {
            $: {
              where: whereClause,
              limit: 1,
            },
            elements: {
              asset: {
                file: {}, // Include the linked file to get URLs
              },
            },
          },
        },
        // Pass sessionId as a parameter for permission checks via ruleParams
        this.sessionId
          ? { ruleParams: { sessionId: this.sessionId } }
          : undefined,
      );

      console.log("Query result:", result);

      const { canvasProjects: projects } =
        result.data as CanvasProjectsWithElementsQueryData;
      const project = projects?.[0];

      if (!project) {
        console.log("No project found - returning null");
        return null;
      }

      this.currentProjectId = project.id;

      const projectElements = project.elements || [];
      const elements: CanvasElement[] = projectElements.map((el) => {
        const imageId = el.type === "image" ? el.asset?.id : undefined;
        const videoId = el.type === "video" ? el.asset?.id : undefined;

        // Log if asset is missing
        if (el.type === "image" && !el.asset) {
          console.warn(`Element ${el.id} is missing asset link!`);
        }

        return {
          id: el.id,
          type: el.type as CanvasElement["type"],
          imageId,
          videoId,
          transform: {
            x: el.x ?? 0,
            y: el.y ?? 0,
            rotation: el.rotation ?? 0,
            scale: el.scale ?? 1,
            cropBox:
              el.cropX !== undefined
                ? {
                    x: el.cropX ?? 0,
                    y: el.cropY ?? 0,
                    width: el.cropWidth ?? 0,
                    height: el.cropHeight ?? 0,
                  }
                : undefined,
          },
          zIndex: el.zIndex ?? 0,
          width: el.width,
          height: el.height,
          duration: el.duration,
          currentTime: el.currentTime,
          isPlaying: el.isPlaying,
          volume: el.volume,
          muted: el.muted,
        };
      });

      console.log(
        "Successfully loaded canvas state with",
        elements.length,
        "elements",
      );
      console.log(
        "Elements with imageId:",
        elements.filter((e) => e.imageId).length,
      );
      console.log(
        "Elements without imageId:",
        elements.filter((e) => e.type === "image" && !e.imageId).length,
      );

      return {
        elements,
        backgroundColor: project.backgroundColor,
        lastModified: project.lastModified
          ? new Date(project.lastModified).getTime()
          : Date.now(),
        viewport: {
          x: project.viewportX ?? 0,
          y: project.viewportY ?? 0,
          scale: project.viewportScale ?? 1,
        },
      };
    } catch (error) {
      console.error("Failed to get canvas state:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
      return null;
    }
  }

  /**
   * Fix missing asset links for existing elements (one-time migration)
   */
  async fixMissingAssetLinks(): Promise<void> {
    try {
      console.log("Starting asset link fix...");

      const projectId = await this.getCurrentProject();
      if (!projectId) {
        throw new Error("No project ID available");
      }

      // Get all elements for this project
      const result = await db.queryOnce({
        canvasElements: {
          $: {
            where: {
              "project.id": projectId as string,
            },
          },
          asset: {},
        },
      });

      const fixTxs: ReturnType<
        (typeof db.tx.canvasElements)[string]["link"]
      >[] = [];
      const { canvasElements } =
        result.data as CanvasElementsWithAssetQueryData;
      const elements = canvasElements || [];

      for (const element of elements) {
        // If element has no asset link but should have one, add it
        if (!element.asset) {
          // Try to find asset by matching element ID with asset ID
          const assetResult = await db.queryOnce({
            canvasAssets: {
              $: {
                where: { id: element.id },
              },
            },
          });

          const { canvasAssets: assets } =
            assetResult.data as CanvasAssetsQueryData;
          if (assets && assets.length > 0) {
            console.log(`Fixing asset link for element ${element.id}`);
            fixTxs.push(
              db.tx.canvasElements[element.id].link({
                asset: assets[0].id,
              }),
            );
          }
        }
      }

      if (fixTxs.length > 0) {
        await db.transact(fixTxs);
        console.log(`Fixed ${fixTxs.length} missing asset links`);
      } else {
        console.log("No missing asset links found");
      }
    } catch (error) {
      console.error("Failed to fix asset links:", error);
    }
  }

  /**
   * Clear all canvas data
   */
  async clearAll(): Promise<void> {
    try {
      const whereClause = this.userId
        ? { "user.id": this.userId }
        : this.sessionId
          ? { sessionId: this.sessionId }
          : undefined;

      if (!whereClause) {
        return;
      }

      // Get all projects
      const result = await db.queryOnce(
        {
          canvasProjects: {
            $: {
              where: whereClause,
            },
            elements: {},
          },
        },
        // Pass sessionId as a parameter for permission checks via ruleParams
        this.sessionId
          ? { ruleParams: { sessionId: this.sessionId } }
          : undefined,
      );

      const { canvasProjects: projects } =
        result.data as CanvasProjectsWithElementsQueryData;
      const projectList = projects || [];

      // Delete all elements
      const elementTxs = projectList.flatMap((project) =>
        (project.elements || []).map((el) =>
          db.tx.canvasElements[el.id].delete(),
        ),
      );

      // Delete all projects
      const projectTxs = projectList.map((project) =>
        db.tx.canvasProjects[project.id].delete(),
      );

      // Get all assets
      const assetResult = await db.queryOnce({
        canvasAssets: {
          $: {
            where: this.userId ? { "user.id": this.userId } : {}, // For session-based, we'll need to track differently
          },
        },
      });

      // Delete all assets
      const { canvasAssets } = assetResult.data as CanvasAssetsQueryData;
      const assetList = canvasAssets || [];
      const assetTxs = assetList.map((asset) =>
        db.tx.canvasAssets[asset.id].delete(),
      );

      const allTxs = [...elementTxs, ...projectTxs, ...assetTxs];
      if (allTxs.length > 0) {
        await db.transact(allTxs);
      }

      // Clear temporary storage
      this.imageDataUrls.clear();
      this.videoDataUrls.clear();
      this.currentProjectId = null;
    } catch (error) {
      console.error("Failed to clear all data:", error);
      throw error;
    }
  }

  /**
   * Cleanup old data (keep only recent projects)
   */
  async cleanupOldData(): Promise<void> {
    try {
      const whereClause = this.userId
        ? { "user.id": this.userId }
        : this.sessionId
          ? { sessionId: this.sessionId }
          : undefined;

      if (!whereClause) {
        return;
      }

      // Get all projects sorted by last modified
      const result = await db.queryOnce(
        {
          canvasProjects: {
            $: {
              where: whereClause,
              order: { lastModified: "desc" },
            },
          },
        },
        // Pass sessionId as a parameter for permission checks via ruleParams
        this.sessionId
          ? { ruleParams: { sessionId: this.sessionId } }
          : undefined,
      );

      const { canvasProjects: projects } =
        result.data as CanvasProjectsQueryData;
      const projectList = projects || [];
      // Keep only the most recent project, delete others
      const projectsToDelete = projectList.slice(1);

      if (projectsToDelete.length > 0) {
        const txs = projectsToDelete.map((project) =>
          db.tx.canvasProjects[project.id].delete(),
        );
        await db.transact(txs);
      }
    } catch (error) {
      console.error("Failed to cleanup old data:", error);
    }
  }
}

// Export a singleton instance
export const canvasStorage = new InstantCanvasStorage();
