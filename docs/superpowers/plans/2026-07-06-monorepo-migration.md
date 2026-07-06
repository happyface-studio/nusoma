# Monorepo Migration (bun + Turborepo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the repo from two independent bun projects (Next app at root + eve agent in `agent/`) into one bun workspace driven by Turborepo, with global dev commands and room for a future RN app.

**Architecture:** `git mv` the Next app to `apps/web` and the agent to `apps/agent`; a thin workspace root (`package.json` + `turbo.json` + `tsconfig.base.json`) drives both via Turbo scripts; a single root `bun.lock`. This is a **move + wiring change only** — no app source logic changes.

**Tech Stack:** bun workspaces, Turborepo 2.x, TypeScript (web 5.9 / agent 7-RC), Next 16, eve.

## Global Constraints

- Spec of record: `docs/superpowers/specs/2026-07-06-monorepo-migration-design.md`. Base branch: `feat/monorepo`.
- Layout: `apps/web` (package name **`web`**), `apps/agent` (package name **`agent`**), `packages/` ships **empty** (a single `.gitkeep`, no workspace packages).
- **Single** root `bun.lock`. No per-app lockfiles (`agent/bun.lock`, `apps/web/bun.lock` must not exist).
- Ports: web `3000` (unchanged), agent **`2000`** via `eve dev --port 2000`.
- `tsconfig.base.json` holds **only** `strict`, `esModuleInterop`, `skipLibCheck` — nothing else. Both apps `extends` it and keep all env-specific options local.
- Root-level tooling: `package.json`, `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `.gitignore`, husky (`prepare` + `.husky/`), lint-staged config, `docs/`, `.github/`, and AI-tool dirs (`.claude`, `.cursor`, etc.) stay at repo root.
- App-local tooling stays inside `apps/web`: `next.config.ts`, `content-collections.ts`, `postcss.config.mjs`, `components.json`, the `@/*` path alias.
- Preserve git history — relocate with `git mv`, never delete+recreate.
- Do **not** modify anything under `apps/web/src/**` or `apps/agent/agent/**` source logic. Do not touch `docs/`, `.github/`, `.husky/_/`, or the AI-tool dirs' contents.
- Pure-move commits use `git commit --no-verify` (renames have nothing to lint, and lint-staged auto-fixing hundreds of moved files is undesirable). The Task 3 docs commit runs the hook normally to prove husky still fires.
- Pre-existing reality (out of scope, must not worsen): `apps/web` has ~12 pre-existing `tsc` errors unrelated to this move. The migration must introduce **zero new** errors (especially no "cannot find module `@/...`" path breakage).

---

## File Structure

**Created:**

- `package.json` (new workspace root) — workspaces glob, Turbo scripts, root dev tooling, lint-staged config.
- `turbo.json` — task pipeline (dev/build/typecheck/lint/db:push).
- `tsconfig.base.json` — the 3 shared compiler options.
- `packages/.gitkeep` — marks the (empty) shared-packages dir.
- `apps/agent/.env.example` (Task 3) — documents the agent's local env vars.

**Moved (history preserved):**

- Everything Next-app at root → `apps/web/` (`src/`, `public/`, `package.json`, `tsconfig.json`, `next.config.ts`, `content-collections.ts`, `postcss.config.mjs`, `components.json`, `posthog.ts`, `next-*.d.ts`, `.env.example`).
- `agent/` → `apps/agent/`.

**Modified:**

- `apps/web/package.json` — drop `prepare`, drop lint-staged block, drop `husky`+`lint-staged` devDeps.
- `apps/web/tsconfig.json`, `apps/agent/tsconfig.json` — `extends` the base, drop the 3 shared options.
- `apps/agent/package.json` — `dev` → `eve dev --port 2000`.
- `eslint.config.mjs` (root) — add `apps/agent/**`, `packages/**`, `**/.content-collections/**` to `ignores`.
- `README.md` (Task 3) — monorepo dev section + Vercel root-dir note.

**Stays at root, unchanged:** `eslint.config.mjs` (edited only for ignores), `.gitignore`, `.husky/`, `docs/`, `.github/`, AI-tool dirs, `bun.lock` (rewritten in place by install).

---

## Task 1: Relocate the agent into `apps/agent/`

**Files:**

- Move: `agent/` → `apps/agent/`
- Delete: `apps/agent/bun.lock`
- Modify: `apps/agent/package.json` (dev script)

**Interfaces:**

- Produces: agent at `apps/agent/` (package name `agent`), dev script `eve dev --port 2000`, no per-app lockfile. Later tasks (root workspace, tsconfig wiring) assume this path.

- [ ] **Step 1: Create `apps/` and move the agent**

```bash
mkdir -p apps
git mv agent apps/agent
```

- [ ] **Step 2: Delete the agent's per-app lockfile**

```bash
rm -f apps/agent/bun.lock
```

- [ ] **Step 3: Pin the agent dev port to 2000**

Edit `apps/agent/package.json`, changing only the `dev` script:

```jsonc
  "scripts": {
    "build": "eve build",
    "dev": "eve dev --port 2000",
    "start": "eve start",
    "typecheck": "tsc"
  },
```

(If `eve dev` rejects `--port`, run `cd apps/agent && bunx eve dev --help` to find the correct flag and use that; the intent is: agent dev server binds 2000, not 3000.)

- [ ] **Step 4: Verify the move + history**

```bash
ls apps/agent/agent/agent.ts                       # exists
ls apps/agent/bun.lock 2>/dev/null && echo "FAIL: lockfile still present" || echo "ok: no lockfile"
git log --follow --oneline apps/agent/agent/agent.ts | head -3   # shows pre-move history
git status --porcelain | grep -E '^R' | head       # renames, not delete+add
```

Expected: `agent.ts` listed; "ok: no lockfile"; history lines present; `R` (rename) entries.

- [ ] **Step 5: Commit (pure move — skip hooks)**

```bash
git add -A
git commit --no-verify -m "refactor(monorepo): relocate agent to apps/agent, pin dev port 2000

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Note: do **not** run `bun install` here — the agent can't install standalone until Task 2 creates the workspace root. That's expected.

---

## Task 2: Relocate the web app and create the workspace root

This is the core transformation. It ends in a fully working monorepo. Execute the steps in order; the repo is momentarily inconsistent mid-task and becomes coherent again at Step 12 (install) — commit only at the end (Step 14).

**Files:**

- Move: Next-app files at root → `apps/web/`
- Create: `package.json` (root), `turbo.json`, `tsconfig.base.json`, `packages/.gitkeep`
- Modify: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/agent/tsconfig.json`, `eslint.config.mjs`
- Delete (gitignored regen artifacts): `.content-collections/`, `tsconfig.tsbuildinfo`, `.eve/`

**Interfaces:**

- Consumes: `apps/agent/` from Task 1.
- Produces: root workspace (`workspaces: ["apps/*","packages/*"]`), Turbo scripts `dev`/`dev:web`/`dev:agent`/`build`/`typecheck`/`lint`/`db:push`, `tsconfig.base.json` extended by both apps, single root `bun.lock`.

- [ ] **Step 1: Move the Next app into `apps/web/`**

```bash
mkdir -p apps/web
git mv \
  src public components.json content-collections.ts next.config.ts \
  next-env.d.ts next-page.d.ts next-params.d.ts postcss.config.mjs \
  posthog.ts package.json tsconfig.json .env.example \
  apps/web/
```

(Do **not** move: `bun.lock`, `eslint.config.mjs`, `.gitignore`, `README.md`, `docs/`, `.github/`, `.husky/`, or AI-tool dirs — they stay at root.)

- [ ] **Step 2: Move the untracked local env file (plain `mv`, it's gitignored)**

```bash
[ -f .env ] && mv .env apps/web/.env || echo "no root .env to move"
```

- [ ] **Step 3: Remove stale root build artifacts (all gitignored, regenerate under apps/web or apps/agent)**

```bash
rm -rf .content-collections tsconfig.tsbuildinfo .eve
```

- [ ] **Step 4: Write the new workspace-root `package.json`**

Create `package.json` (at repo root):

```json
{
  "name": "nusoma",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "turbo run dev",
    "dev:web": "turbo run dev --filter=web",
    "dev:agent": "turbo run dev --filter=agent",
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "lint": "turbo run lint",
    "format:check": "prettier --check \"apps/**/*.{ts,tsx,js,jsx,mdx}\" --cache",
    "format:fix": "prettier --write \"apps/**/*.{ts,tsx,js,jsx,mdx}\" --cache",
    "db:push": "turbo run db:push --filter=web",
    "prepare": "husky"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.3.5",
    "@next/eslint-plugin-next": "^16.2.10",
    "@types/node": "^24.13.2",
    "eslint": "^9.39.4",
    "eslint-config-next": "16.0.7",
    "eslint-plugin-react-hooks": "^7.1.1",
    "husky": "^9.1.7",
    "lint-staged": "^16.4.0",
    "prettier": "^3.9.4",
    "prettier-plugin-tailwindcss": "^0.7.4",
    "turbo": "^2",
    "typescript": "^5.9.3"
  },
  "lint-staged": {
    "apps/web/**/*.{ts,tsx,js,jsx,mdx}": [
      "prettier --write --cache",
      "eslint --fix"
    ],
    "apps/agent/**/*.{ts,mts}": ["prettier --write --cache"],
    "**/*.{json,md}": ["prettier --write --cache"]
  }
}
```

Rationale for the eslint/prettier duplication (also in `apps/web`): the root copies serve lint-staged + the root eslint config; `apps/web` keeps its own for `next build`/`eslint .`. bun dedupes them in the lockfile — not worth surgically removing. lint-staged runs `eslint --fix` on **web only** (agent has no eslint config; agent files get prettier only).

- [ ] **Step 5: Write `turbo.json`**

Create `turbo.json` (at repo root):

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", ".output/**", "dist/**"]
    },
    "typecheck": {},
    "lint": {},
    "db:push": { "cache": false }
  }
}
```

- [ ] **Step 6: Write `tsconfig.base.json`**

Create `tsconfig.base.json` (at repo root):

```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 7: Create the empty `packages/` marker**

```bash
mkdir -p packages
```

Create `packages/.gitkeep`:

```
# Shared workspace packages live here. Empty by design — see
# docs/superpowers/specs/2026-07-06-monorepo-migration-design.md §2.
# Add a package only when web/agent (or a future RN app) genuinely share code.
```

- [ ] **Step 8: Trim `apps/web/package.json`** (remove root-only tooling)

Edit `apps/web/package.json`:

1. Delete the `"prepare": "husky"` line from `scripts`.
2. Delete the entire top-level `"lint-staged": { ... }` block.
3. Remove `"husky"` and `"lint-staged"` from `devDependencies`.

Leave everything else (name stays `"web"`, all runtime deps, `dev`/`build`/`lint`/`typecheck`/`db:push` scripts, its own eslint/prettier/typescript devDeps) untouched.

- [ ] **Step 9: Wire `apps/web/tsconfig.json` to the base**

Replace `apps/web/tsconfig.json` with (adds `extends`, drops `strict`/`esModuleInterop`/`skipLibCheck`; everything else identical):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "noEmit": false,
    "composite": true,
    "module": "esnext",
    "declaration": true,
    "declarationMap": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "paths": {
      "@/*": ["./src/*"],
      "content-collections": ["./.content-collections/generated"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    "build/types/**/*.ts",
    "next-env.d.ts",
    "out/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules", "**/*.test.ts"]
}
```

- [ ] **Step 10: Wire `apps/agent/tsconfig.json` to the base**

Replace `apps/agent/tsconfig.json` with:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"],
    "noEmit": true
  },
  "include": ["agent/**/*.ts", "evals/**/*.ts", ".eve/**/*.d.ts"]
}
```

- [ ] **Step 11: Add monorepo ignores to the root ESLint config**

Edit `eslint.config.mjs`, replacing the first (ignores) config object's array so agent/packages/generated dirs aren't linted by the Next ruleset:

```js
  {
    ignores: [
      "node_modules/**",
      "**/.next/**",
      "**/out/**",
      "**/build/**",
      "**/next-env.d.ts",
      "apps/agent/**",
      "packages/**",
      "**/.content-collections/**"
    ]
  },
```

- [ ] **Step 12: Single install at root (rewrites `bun.lock` as the workspace lockfile)**

```bash
bun install
```

Expected: install succeeds; resolves both `apps/web` and `apps/agent`; root `bun.lock` updated.

- [ ] **Step 13: Verify the monorepo works (no secrets needed)**

```bash
# single lockfile
ls apps/web/bun.lock apps/agent/bun.lock 2>/dev/null && echo "FAIL: stray lockfile" || echo "ok: single root lockfile"

# money-path unit tests survived the move
cd apps/web && bun test && cd ../..

# typecheck fans out to both apps; web shows ONLY pre-existing errors,
# and crucially NO "Cannot find module '@/...'" (which would mean path breakage)
bunx turbo run typecheck 2>&1 | tee /tmp/mono-tc.txt; grep -c "Cannot find module '@/" /tmp/mono-tc.txt

# history preserved across the rename
git log --follow --oneline apps/web/src/app/layout.tsx | head -3
```

Expected: "ok: single root lockfile"; `bun test` → 8 pass; `grep -c` for `@/` module errors → **0**; history lines present. (Other pre-existing `tsc` errors may appear — that's the documented baseline, not a regression.)

- [ ] **Step 14: Commit (structural move — skip hooks; husky is verified in Task 3)**

```bash
git add -A
git commit --no-verify -m "refactor(monorepo): move web to apps/web, add bun+turbo workspace root

- workspace root package.json (turbo scripts, root husky/lint-staged)
- turbo.json pipeline; tsconfig.base.json shared by both apps
- single root bun.lock; agent+web tsconfigs extend the base
- eslint ignores apps/agent + packages

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Verify wiring end-to-end and document

**Files:**

- Create: `apps/agent/.env.example`
- Modify: `apps/web/.env.example` (add `AGENT_URL`), `README.md`

**Interfaces:**

- Consumes: the working monorepo from Task 2.
- Produces: documented dev workflow + agent env template; proof that Turbo filters and husky both work.

- [ ] **Step 1: Verify Turbo task wiring via dry-runs (no servers booted, no secrets)**

```bash
bunx turbo run dev --dry=json | grep -E '"(task|package)"' | head       # lists dev tasks for web AND agent
bunx turbo run dev --filter=web --dry  | grep -iE 'web|agent'            # web only
bunx turbo run dev --filter=agent --dry | grep -iE 'web|agent'          # agent only
bunx turbo run build --dry | grep -iE 'web|agent'                        # both have build
```

Expected: full `dev` dry-run references both `web` and `agent`; `--filter=web` shows only web; `--filter=agent` shows only agent. This proves the scripts + filters without long-running processes.

- [ ] **Step 2: Confirm husky is active post-migration**

```bash
git config core.hooksPath        # expect: .husky/_   (set by `prepare: husky` during Task 2 install)
cat .husky/pre-commit            # expect: npx lint-staged
```

(The normal-mode commit in Step 6 exercises the hook for real.)

- [ ] **Step 3: Add `AGENT_URL` to the web env template**

Edit `apps/web/.env.example`, adding under the `#vercel`/app section:

```
# creative agent (eve) — local dev
AGENT_URL=http://127.0.0.1:2000
```

- [ ] **Step 4: Create the agent env template**

Create `apps/agent/.env.example`:

```
# eve agent — local dev
FAL_KEY=
AI_GATEWAY_API_KEY=vck_xxx
NUSOMA_INTERNAL_URL=http://127.0.0.1:3000
NUSOMA_SERVICE_SECRET=
```

- [ ] **Step 5: Document the monorepo in `README.md`**

Append this section to `README.md`:

````markdown
## Monorepo

Bun workspace driven by Turborepo.

- `apps/web` — the Next.js app (port 3000)
- `apps/agent` — the eve creative agent (port 2000)
- `packages/` — shared packages (currently empty)

### Development

```bash
bun install            # once, at the repo root — single lockfile
bun run dev            # both apps in parallel (web :3000, agent :2000)
bun run dev:web        # web only
bun run dev:agent      # agent only
bun run typecheck      # tsc across both apps
bun run lint           # eslint (web)
bun run db:push        # InstantDB schema push (web)
```
````

Env: copy `apps/web/.env.example` → `apps/web/.env` and `apps/agent/.env.example` → `apps/agent/.env`, then fill in secrets. Locally, web calls the agent at `AGENT_URL` and the agent calls back at `NUSOMA_INTERNAL_URL`.

### Deployment (Vercel)

Two projects, one repo. Set each project's **Root Directory**:

- web project → `apps/web`
- agent project → `apps/agent`

````

- [ ] **Step 6: Commit (normal — this proves husky/lint-staged fire from the new root)**

```bash
git add -A
git commit -m "docs(monorepo): dev workflow, Vercel root dirs, agent env template

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
````

Expected: the pre-commit hook runs lint-staged (prettier/eslint) from the repo root and the commit succeeds — confirming git hooks work after the restructure.

---

## Deferred to live verification (needs the user's secrets / dashboard — out of plan scope)

Per the design's "verify live later" stance, these are **not** plan steps:

- Real `bun run dev` with populated `.env` files → both servers up, web↔agent round-trip.
- `bunx turbo run build` producing a real Next build (needs env) and a real `eve build`.
- Updating the two Vercel projects' Root Directory in the dashboard, then a deploy.

## Self-review notes (coverage vs spec)

- Spec §2/§3 layout → Tasks 1–2. §4 scripts/ports → Task 2 Steps 3,4,5. §5 mechanics (git mv, single lockfile, tooling relocation, tsconfig.base) → Task 2. §5.6 Vercel → Task 3 Step 5 (doc only, dashboard deferred). §6 cuts honored (empty packages, no CI rewrite, no dep cleanup, no source changes). §7 verification → Task 2 Step 13 + Task 3 Step 1–2. §8 risks (rename size, manual Vercel, pre-existing tsc errors) acknowledged in Global Constraints.
- `.gitignore`: existing patterns are un-anchored (`.next/`, `.env`, `*.tsbuildinfo`, `.content-collections`, `.eve/`, `node_modules`) so they already match nested under `apps/**` — no gitignore edit needed. Verified conceptually; Step 13/Step 6 `git status` would surface any leak.
