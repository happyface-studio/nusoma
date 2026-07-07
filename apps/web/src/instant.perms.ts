// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  $files: {
    allow: {
      view: "true",
      // ponytail: create stays open — guests upload before they have an identity.
      // Tighten to path-prefix rules if upload abuse ever shows up.
      create: "true",
      // Only the media's owner may delete: the linked asset's user, or (for
      // guest-owned media) a caller holding the project's session cookie. Guest
      // deletes fail closed if the SDK can't pass ruleParams here — an orphaned
      // file beats letting anyone delete anyone's media.
      delete:
        "auth.id in data.ref('canvasAsset.user.id') || ruleParams.sessionId in data.ref('canvasAsset.elements.project.sessionId')",
    },
  },
  userProfiles: {
    allow: {
      view: "true",
      create: "auth.id in data.ref('user.id')",
      update: "auth.id in data.ref('user.id')",
      delete: "auth.id in data.ref('user.id')",
    },
  },
  folders: {
    allow: {
      view: "auth.id in data.ref('user.id')",
      create: "auth.id in data.ref('user.id')",
      update: "auth.id in data.ref('user.id')",
      delete: "auth.id in data.ref('user.id')",
    },
  },
  canvasProjects: {
    allow: {
      view: "auth.id in data.ref('user.id') || ruleParams.sessionId == data.sessionId",
      create: "true",
      update:
        "auth.id in data.ref('user.id') || ruleParams.sessionId == data.sessionId",
      delete:
        "auth.id in data.ref('user.id') || ruleParams.sessionId == data.sessionId",
    },
  },
  canvasElements: {
    allow: {
      view: "auth.id in data.ref('project.user.id') || ruleParams.sessionId in data.ref('project.sessionId')",
      create: "true",
      update:
        "auth.id in data.ref('project.user.id') || ruleParams.sessionId in data.ref('project.sessionId')",
      delete:
        "auth.id in data.ref('project.user.id') || ruleParams.sessionId in data.ref('project.sessionId')",
    },
  },
  canvasAssets: {
    allow: {
      view: "true", // Allow public viewing since asset IDs are UUIDs
      create: "true",
      update: "auth.id in data.ref('user.id')",
      delete:
        "auth.id in data.ref('user.id') || auth.id in data.ref('elements.project.user.id')",
    },
  },
  canvasHistory: {
    allow: {
      view: "auth.id in data.ref('project.user.id') || ruleParams.sessionId in data.ref('project.sessionId')",
      create: "true",
      update:
        "auth.id in data.ref('project.user.id') || ruleParams.sessionId in data.ref('project.sessionId')",
      delete:
        "auth.id in data.ref('project.user.id') || ruleParams.sessionId in data.ref('project.sessionId')",
    },
  },
  // Server-only accounting, written exclusively via the admin SDK (which
  // bypasses these rules). Without an explicit deny, InstantDB's default-allow
  // would let any client read stream tokens or rewrite spentCredits.
  agentRuns: {
    allow: { view: "false", create: "false", update: "false", delete: "false" },
  },
  agentGenerations: {
    allow: { view: "false", create: "false", update: "false", delete: "false" },
  },
} satisfies InstantRules;

export default rules;
