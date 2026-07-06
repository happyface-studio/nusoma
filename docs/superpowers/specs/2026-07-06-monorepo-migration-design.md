# Monorepo Migration (bun + Turborepo) — Design

**Date:** 2026-07-06
**Status:** Approved design, pre-implementation
**Owner:** Simon Weniger
**Base branch:** `feat/monorepo` (off `main`, after landing PR #1 + WIP + marketing-page)

## 1. Summary

Convert the repo from two independent bun projects — the Next.js app at the
repo root and the eve agent in `agent/` — into a single **bun workspace driven
by Turborepo**. Goal: shared packages when they're actually needed, one
install, and global dev commands (`dev`, `dev:web`, `dev:agent`). Structured so
a future React Native app drops into `apps/` without further restructuring.

**Core principle: enable, don't populate.** The workspace wires `packages/*`
but ships zero packages — web and agent share nothing today (deliberate thin
HTTP waist), so shared packages are extracted only when a real consumer exists
(most likely when the RN app lands).

## 2. Decisions made (with rationale)

| Decision          | Choice                                                           | Rationale                                                                                                                        |
| ----------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Layout            | `apps/web`, `apps/agent`, empty `packages/`                      | Standard; RN app later = `apps/mobile`, no re-layout.                                                                            |
| Orchestrator      | Turborepo over bun as package manager/runtime                    | bun `--filter` already parallelizes dev; Turbo adds build/typecheck **caching** + task graph, which pays off at 3+ targets (RN). |
| Shared packages   | **None created now**                                             | web↔agent share nothing (HTTP/JSON boundary). Empty scaffolding = YAGNI. Add when something is genuinely shared.                 |
| Lockfile          | Single root `bun.lock`; delete `agent/bun.lock`                  | One install for the whole workspace.                                                                                             |
| Dev ports         | web `3000`, agent pinned to `2000`                               | `turbo run dev` starts both in parallel; they must not both bind 3000.                                                           |
| Git hooks         | husky/lint-staged/`prepare` → repo root                          | Hooks must live at the git root; lint-staged globs widen to `apps/**`.                                                           |
| App-local tooling | content-collections, next config, `@/*` alias stay in `apps/web` | `@/*` still resolves against `apps/web/tsconfig.json` — near-zero import churn.                                                  |
| Deployment        | Two Vercel projects, root dirs `apps/web` and `apps/agent`       | Same two-deploy model as today, new root paths.                                                                                  |

## 3. Target layout

```
nusoma/                        ← git root = monorepo root (thin)
  package.json                 ← workspaces + turbo scripts; husky/lint-staged here
  turbo.json                   ← pipeline: dev (no cache), build/typecheck/lint (cached)
  bun.lock                     ← THE single lockfile
  tsconfig.base.json           ← shared strictness defaults (see §5); each app extends it
  apps/
    web/                       ← everything at root today moves here wholesale
      src/  public/  content/
      next.config.ts  content-collections.ts  postcss.config.mjs
      components.json  tsconfig.json  package.json (name: "web")  .env
    agent/                     ← today's agent/ moves here (eve project)
      agent/  package.json (name: "agent")  tsconfig.json  .env  .gitignore
  packages/                    ← convention only — SHIPS EMPTY
  docs/  .github/  .claude/  .husky/   ← stay at repo root
```

## 4. Root scripts (Turbo-driven)

```jsonc
// root package.json
"scripts": {
  "dev":        "turbo run dev",                 // both apps in parallel
  "dev:web":    "turbo run dev --filter=web",
  "dev:agent":  "turbo run dev --filter=agent",
  "build":      "turbo run build",
  "typecheck":  "turbo run typecheck",
  "lint":       "turbo run lint",
  "db:push":    "turbo run db:push --filter=web",
  "prepare":    "husky"
}
```

- `apps/web` keeps `dev: next dev -H 0.0.0.0` (port 3000).
- `apps/agent` `dev` becomes `eve dev --port 2000` (frees 3000 for web).
- `turbo.json`: `dev` = `{ cache: false, persistent: true }`; `build`,
  `typecheck`, `lint` = cached, `build` depends on `^build`.

## 5. Migration mechanics

1. **Relocate with history:** `git mv` all root app files + config into
   `apps/web/`; `git mv agent/ apps/agent/`. Rename-only, history preserved.
2. **Root `package.json`** becomes the workspace root: `"private": true`,
   `"workspaces": ["apps/*", "packages/*"]`, root scripts (§4), and the
   **dev-only** tooling that must live at git root (husky, lint-staged,
   turbo, prettier). App runtime deps stay in `apps/web/package.json`.
3. **Single install:** delete `agent/bun.lock`; run `bun install` at root →
   one `bun.lock`. TS 7-RC (agent) and TS 5.9 (web) coexist — bun nests the
   mismatch; each app runs its own `tsc`.
4. **Tooling relocation:**
   - husky hooks + `prepare: husky` + lint-staged config → root
     `package.json`; lint-staged globs → `apps/**/*.{ts,tsx,...}`.
   - content-collections config, `next.config.ts`, `postcss.config.mjs`,
     `components.json`, `@/*` alias → stay inside `apps/web`.
   - `.eve/` → gitignored (already done on base branch).
5. **`tsconfig.base.json` (thin, shared):** holds only the compiler options
   both apps already set identically — the genuine overlap, nothing forced:

   ```jsonc
   // tsconfig.base.json (repo root)
   {
     "compilerOptions": {
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
     },
   }
   ```

   Each app's `tsconfig.json` gains `"extends": "../../tsconfig.base.json"` and
   drops those three lines; everything env-specific stays local — web keeps
   `target: ES2017`, `moduleResolution: bundler`, `jsx`, `paths`, the next
   plugin, `composite`/`declaration`; agent keeps `target: ES2022`,
   `module`/`moduleResolution: NodeNext`, `types: ["node"]`, `noEmit`, its
   `include`. The base is the one place to raise strictness for both later.

6. **Deployment:** update the two Vercel projects' Root Directory to
   `apps/web` and `apps/agent` (one-time dashboard change, documented in the
   plan — not automated).

## 6. What we are NOT doing (deliberate cuts)

- No `packages/*` workspace packages (no shared eslint/ui/config _packages_).
  The root `tsconfig.base.json` is a plain root file both apps extend — not a
  workspace package — so it does not count against this.
- No CI rewrite beyond fixing paths that assume root = app.
- No dependency de-duplication/hoisting cleanup beyond what bun does itself.
- No change to app source logic — this is a move + wiring change only.

## 7. Verification (how we know it worked)

- `bun install` at root succeeds, produces a single `bun.lock`.
- `bun run dev` starts **both** apps: web on 3000, agent on 2000, no port
  clash.
- `bun run dev:web` / `bun run dev:agent` each start only their target.
- `turbo run build` and `turbo run typecheck` fan out to both apps and
  complete (web's pre-existing tsc errors are out of scope — noted, not
  introduced by this move).
- `git log --follow apps/web/src/app/layout.tsx` shows history survived the
  rename.
- husky pre-commit still fires from the repo root on a staged change under
  `apps/web`.

## 8. Risks accepted

- **Huge rename diff** — mechanical, low-danger, but large to review.
- **Vercel root-dir change is manual** — deploys break until the dashboard
  Root Directory is updated for both projects; called out in the plan.
- **Regenerated artifacts** — `tsconfig.tsbuildinfo`, `.content-collections`,
  `.next` regenerate in the new locations; ensure gitignore still covers them
  under `apps/**`.
- **web's ~12 pre-existing tsc errors** predate this work; the move neither
  fixes nor worsens them.
