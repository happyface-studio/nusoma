// Docs: https://www.instantdb.com/docs/modeling-data

import { i, InstaQLEntity } from "@instantdb/react";

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed(),
    }),
    userProfiles: i.entity({
      externalCustomerId: i.string().optional(), // Polar customer ID
      name: i.string().optional(),
      username: i.string().unique().indexed().optional(),
      language: i.string().optional(),
      bio: i.string().optional(),
      avatar: i.string().optional(), // URL to avatar image
    }),
    canvasProjects: i.entity({
      name: i.string().optional(),
      backgroundColor: i.string().optional(),
      viewportX: i.number().optional(),
      viewportY: i.number().optional(),
      viewportScale: i.number().optional(),
      lastModified: i.date().indexed().optional(),
      sessionId: i.string().optional().indexed(), // For unauthenticated users
      eveSessionState: i.json().optional(), // { continuationToken?, sessionId?, streamIndex }
    }),
    canvasElements: i.entity({
      type: i.string().indexed().optional(), // "image", "video", "text", "shape"
      x: i.number().optional(),
      y: i.number().optional(),
      width: i.number().optional(),
      height: i.number().optional(),
      rotation: i.number().optional(),
      scale: i.number().optional(),
      zIndex: i.number().optional(),
      // Crop properties
      cropX: i.number().optional(),
      cropY: i.number().optional(),
      cropWidth: i.number().optional(),
      cropHeight: i.number().optional(),
      // Video-specific properties
      duration: i.number().optional(),
      currentTime: i.number().optional(),
      isPlaying: i.boolean().optional(),
      volume: i.number().optional(),
      muted: i.boolean().optional(),
    }),
    canvasAssets: i.entity({
      type: i.string().indexed().optional(), // "image" or "video"
      duration: i.number().optional(), // For videos
      createdAt: i.date().indexed().optional(),
      prompt: i.string().optional(), // Generation prompt used to create this asset
      creditsConsumed: i.number().optional(), // Credits consumed for generating this asset
    }),
    folders: i.entity({
      name: i.string(),
      order: i.number().indexed().optional(), // For sorting folders
      createdAt: i.date().indexed().optional(),
    }),
    canvasHistory: i.entity({
      snapshotData: i.json().optional(), // Store the full state as JSON
      timestamp: i.date().indexed().optional(),
      order: i.number().indexed().optional(), // To maintain history order
    }),
    agentRuns: i.entity({
      runId: i.string().unique().indexed(),
      userId: i.string().optional().indexed(),
      sessionId: i.string().optional().indexed(),
      projectId: i.string().indexed(),
      spentCredits: i.number(),
      createdAt: i.date().indexed(),
      // eve session this run streams from; binds /api/agent/stream to the run.
      eveSessionId: i.string().optional().indexed(),
      // Bearer token for /api/agent/stream. Admin-written; agentRuns perms deny
      // all client reads, so this never leaves the server except to the run's creator.
      streamToken: i.string().optional().indexed(),
      // { x, y, width, height } the client reserved for the run's first asset.
      plannedPlacement: i.json().optional(),
    }),
    agentGenerations: i.entity({
      idempotencyKey: i.string().unique().indexed(),
      runId: i.string().indexed(),
      endpoint: i.string(),
      status: i.string().indexed(), // 'running' | 'completed' | 'failed'
      assetId: i.string().optional(),
      credits: i.number().optional(),
      cost: i.number().optional(),
      createdAt: i.date().indexed(),
    }),
  },
  links: {
    // User Profile link
    userProfileUser: {
      forward: { on: "userProfiles", has: "one", label: "user" },
      reverse: { on: "$users", has: "one", label: "profile" },
    },
    // Canvas links
    canvasProjectUser: {
      forward: { on: "canvasProjects", has: "one", label: "user" },
      reverse: { on: "$users", has: "many", label: "canvasProjects" },
    },
    canvasProjectElements: {
      forward: {
        on: "canvasElements",
        has: "one",
        label: "project",
        onDelete: "cascade",
      },
      reverse: { on: "canvasProjects", has: "many", label: "elements" },
    },
    canvasElementAsset: {
      forward: {
        on: "canvasElements",
        has: "one",
        label: "asset",
      },
      reverse: { on: "canvasAssets", has: "many", label: "elements" },
    },
    canvasAssetUser: {
      forward: { on: "canvasAssets", has: "one", label: "user" },
      reverse: { on: "$users", has: "many", label: "canvasAssets" },
    },
    canvasAssetFile: {
      forward: {
        on: "canvasAssets",
        has: "one",
        label: "file",
        onDelete: "cascade",
      },
      reverse: { on: "$files", has: "one", label: "canvasAsset" },
    },
    // Asset lineage links
    assetLineage: {
      forward: {
        on: "canvasAssets",
        has: "many",
        label: "referencedAssets", // The input assets used to create this one
      },
      reverse: {
        on: "canvasAssets",
        has: "many",
        label: "derivedAssets", // The output assets created from this one
      },
    },
    // Folder links
    folderUser: {
      forward: { on: "folders", has: "one", label: "user" },
      reverse: { on: "$users", has: "many", label: "folders" },
    },
    projectFolder: {
      forward: { on: "canvasProjects", has: "one", label: "folder" },
      reverse: { on: "folders", has: "many", label: "projects" },
    },
    projectHistory: {
      forward: {
        on: "canvasHistory",
        has: "one",
        label: "project",
        onDelete: "cascade",
      },
      reverse: { on: "canvasProjects", has: "many", label: "historySnapshots" },
    },
  },
  rooms: {},
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

// Export entity types for use in other files
export type CanvasProject = InstaQLEntity<AppSchema, "canvasProjects">;
export type CanvasElement = InstaQLEntity<AppSchema, "canvasElements">;
export type CanvasAsset = InstaQLEntity<AppSchema, "canvasAssets">;
export type CanvasHistory = InstaQLEntity<AppSchema, "canvasHistory">;
export type UserProfile = InstaQLEntity<AppSchema, "userProfiles">;
export type Folder = InstaQLEntity<AppSchema, "folders">;
export type AgentRun = InstaQLEntity<AppSchema, "agentRuns">;
export type AgentGeneration = InstaQLEntity<AppSchema, "agentGenerations">;

// Export types with relations for nested queries
export type CanvasProjectWithElements = InstaQLEntity<
  AppSchema,
  "canvasProjects",
  { elements: { asset: { file: {} } } }
>;
export type CanvasElementWithAsset = InstaQLEntity<
  AppSchema,
  "canvasElements",
  { asset: { file: {} } }
>;
export type CanvasAssetWithFile = InstaQLEntity<
  AppSchema,
  "canvasAssets",
  { file: {} }
>;

export type { AppSchema };
export default schema;
