# Canvas god-component refactor — Phase 1 design

Date: 2026-07-07
Target: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx` (3,710 lines)
Approved scope: two-phase. This spec covers Phase 1 only.

## Problem

The canvas page is a single 3,710-line client component holding ~35 `useState`
atoms, ~15 effects, and ~1,500 lines of handlers. Two distinct diseases:

1. **Size** — everything (viewport math, four video-generation dialog flows,
   persistence, selection sync, keyboard shortcuts, agent placeholders) lives
   in one component body.
2. **Dual source of truth** — local `images`/`videos` arrays are the live
   state; InstantDB is a debounced write-behind copy with an add-only reactive
   merge. This produced the "save deletes agent media" bug class.

Phase 1 fixes (1) with zero behavior change. Phase 2 (separate pass, after
Phase 1 is verified in the app) fixes (2) by making InstantDB the single state
owner — the decomposition isolates all persistence logic into one hook first,
so the inversion becomes a small reviewable diff.

## Goals

- Page drops to a composition root (~600–800 lines: state for
  `images`/`videos`/`selectedIds` + hook wiring + JSX skeleton).
- Zero observable behavior change.
- Delete all verified-unreachable code.

## Non-goals (Phase 2 or later)

- State-ownership inversion (InstantDB as owner, transact-on-gesture-end).
- Wiring the Run button's disabled state to agent status (today it is never
  disabled; preserving that).
- Pipeline unification, checkout userId fix (separate backlog).

## Deletions (all verified unreachable by grep)

- **Legacy image-generation path**: `generation-handler.ts#handleRun` is
  exported but never imported; it is the only writer that adds to
  `activeGenerations` or sets `isGenerating(true)`. Therefore delete:
  - `activeGenerations` state + `<StreamingImage>` render block + image
    `GeneratingPlaceholder`s + `activeGenerations.has(...)` filters + the
    `generationState` ternary (collapses to a constant).
  - `isGenerating` state (constant `false`; children that require the prop
    receive the literal).
  - `generation-handler.ts` itself; retarget the two `uploadImageDirect`
    imports (page, `background-handler.ts`) to `generation-helpers.ts` where
    the function is defined.
  - `StreamingImage.tsx` / `useStreamingImage.ts` if reference-free after the
    above.
  - NOTE: `activeVideoGenerations` (video pipeline) is alive — untouched.
- **Style dialog** (~90 lines): `isStyleDialogOpen` is never set to true.
  Delete dialog JSX, the state, `previousStyleId`, and its tracking effect.
- **Write-only state**: `showSuccess` + the `previousGenerationCount` effect;
  `isSaving` (destructured `_`); `resizeImageIfNeeded` (never called).
- **Commented-out blocks**: MiniMap, CanvasRightSidebar, minimap localStorage
  effects, dead imports (`ShortcutBadge`, `VideoControls`, `visibleIndicators`).
- **Isolate debug code**: the "AUTO DOWNLOAD FOR DEBUGGING" anchor-click and
  the red-canvas transparency probe inside `handleIsolate`.

## Extractions

Same code, new homes, following the existing `useCanvasActions` /
`useCanvasHistory` dependency-injection pattern (state owned by page where
shared, passed in via options object). `images`, `videos`, `selectedIds`
remain in the page.

| New file                              | Owns                                                                                                                                                                                                              | In                                                                                                                                                        | Out                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `hooks/useCanvasPersistence.ts`       | `isStorageLoaded`, `saveToStorage`, `loadFromStorage`, storage-init / auto-save-debounce / visibility-save effects, reactive merge of `project.elements`, agent-done reload                                       | projectId, user, sessionId, images/videos + setters, viewport/setViewport, agentStatus, project elements, toast                                           | `isStorageLoaded`, `saveToStorage`                                                     |
| `hooks/useVideoGenerationPipeline.ts` | All 4 dialog flows (img→vid, vid→vid, extend, bg-removal): 12 state atoms, `activeVideoGenerations`, complete/error/progress handlers                                                                             | images, videos, setVideos, saveToHistory, toast, falClient, user, sessionId, refetchCredits, viewport, canvasSize                                         | dialog props per flow, context-menu openers, `activeVideoGenerations`, busy flags      |
| `hooks/useCanvasViewport.ts`          | `viewport`, `canvasSize`, `isCanvasReady`, pan + touch state, `handleWheel`, touch handlers, mouse down/move/up (pan + selection box), `selectionBox`, `isSelecting`, resize / body-scroll / canvas-ready effects | images, videos (hit tests), setSelectedIds, onClearSelection callback, isDraggingImage (gates touch-pan)                                                  | viewport, setViewport, canvasSize, selectionBox, isPanningCanvas, stage event handlers |
| `hooks/useIsolateObject.ts`           | `isolateTarget`, `isolateInputValue`, `isIsolating`, `handleIsolate` (debug code removed)                                                                                                                         | images, setImages, setSelectedIds, saveToHistory, falClient, isolateObject mutation, toast                                                                | state trio + setters + handler                                                         |
| `hooks/usePromptSync.ts`              | `syncSourceRef`, `handleSelect`, clear-references-on-empty-click, `onAssetReferencesChange`                                                                                                                       | promptEditorRef, images, videos, selectedIds, setSelectedIds                                                                                              | `handleSelect`, `clearSelection`, `onAssetReferencesChange`                            |
| `hooks/useAgentGeneration.ts`         | `generatingSlot`, `handleRun`, slot-landing effect, agent-status safety net                                                                                                                                       | images, videos, generationSettings, projectId, startAgentRun, agentStatus, user                                                                           | `generatingSlot`, `handleRun`                                                          |
| `hooks/useCanvasShortcuts.ts`         | the keydown/keyup effect                                                                                                                                                                                          | callbacks (undo, redo, delete, duplicate, run, layer ops, zoom, crop-escape) + gating state                                                               | —                                                                                      |
| `hooks/useSnapDragHandlers.ts`        | the duplicated inline `onDragMove`/`onDragStart`/`onDragEnd` for images and videos, deduped into one factory                                                                                                      | getSnapping, updateGuideLines, clearGuideLines, selectedIds, dragStartPositions + setter, saveToHistory, setIsDraggingImage, hidden-video-controls setter | `makeHandlers(kind)` used by both render maps                                          |
| `utils/canvas-utils.ts` (existing)    | `createCroppedImage`, file-upload helpers (`handleFileUpload` becomes a thin page-level closure over a pure helper)                                                                                               | —                                                                                                                                                         | pure functions                                                                         |

## Correctness checkpoint

Resolved during design review: `handleRun` no longer needs to pass
`authToken` — commit `edc62e5` ("improve auth") moved the InstantDB session
token into a module-level store (`lib/auth/authToken.ts`), and `useAgentRun`
attaches the Bearer header itself via `authHeader()`. No action needed in the
extraction.

## Execution order

1. Deletions (single commit-sized step; typecheck + tests after).
2. Extractions one hook at a time, page shrinking with each; typecheck after
   each, full test run at the end.
3. `next build` as the final gate.

## Verification

- `tsc` clean for touched files (14 pre-existing errors in unrelated files are
  out of scope).
- All existing bun tests pass (22 at time of writing).
- `next build` succeeds.
- Manual smoke checklist for the user: pan/zoom (wheel, pinch, middle-mouse),
  marquee + shift select, drag with snapping (single + multi), crop
  (double-click, escape), delete/undo/redo, file drop, agent run with
  placeholder → asset landing, one video dialog flow, keyboard shortcuts.

## Risks

- The mouse handlers interleave pan and selection concerns; they move together
  into `useCanvasViewport` to avoid re-plumbing mid-gesture state.
- The keyboard-shortcut effect has a wide dependency array; extraction keeps
  the same deps to avoid stale-closure regressions.
- Deletion cascade (`StreamingImage` et al.) is gated on a reference check,
  not assumption.

## Phase 2 outline (not in scope, for continuity)

Make InstantDB the element owner: render `images`/`videos` derived from
`db.useQuery`, keep ephemeral local state only for in-flight gestures, commit
transacts on gesture end, delete `saveToStorage`/`loadFromStorage`/merge
machinery and most of `instant-storage.ts`'s canvas-state layer. History moves
to DB-backed snapshots (already partially true via `useCanvasHistory`).
