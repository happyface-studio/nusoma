// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from "@instantdb/react";

const rules = {
  conversations: {
    allow: {
      view: "auth.id in data.ref('user.id') || ruleParams.sessionId == data.sessionId",
      create: "true",
      update:
        "auth.id in data.ref('user.id') || ruleParams.sessionId == data.sessionId",
      delete:
        "auth.id in data.ref('user.id') || ruleParams.sessionId == data.sessionId",
    },
  },
  messages: {
    allow: {
      view: "auth.id in data.ref('conversation.user.id') || ruleParams.sessionId in data.ref('conversation.sessionId')",
      create: "true",
      update:
        "auth.id in data.ref('conversation.user.id') || ruleParams.sessionId in data.ref('conversation.sessionId')",
      delete:
        "auth.id in data.ref('conversation.user.id') || ruleParams.sessionId in data.ref('conversation.sessionId')",
    },
  },
  $files: {
    allow: {
      view: "true",
      create: "true",
      delete: "true",
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
} satisfies InstantRules;

export default rules;
