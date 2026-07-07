# Canvas Page Decomposition (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx` from 3,710 lines to a ~600–800-line composition root with zero behavior change, per the approved design spec (`docs/superpowers/specs/2026-07-07-canvas-god-component-refactor-design.md`).

**Architecture:** Deletions of verified-unreachable code first (Tasks 1–2), then behavior-preserving extractions into hooks following the existing `useCanvasActions` dependency-injection pattern (state that multiple hooks share — `images`, `videos`, `selectedIds`, `croppingImageId`, `isDraggingImage`, `dragStartPositions`, `hiddenVideoControlsIds` — stays in the page and is passed in via options objects). Each task is one commit.

**Tech Stack:** Next.js 16 app router, React 19, react-konva, InstantDB React SDK, bun test.

## Global Constraints

- All commands run from `apps/web/` unless stated otherwise.
- **Zero behavior change.** Moves are verbatim; the only allowed edits inside moved code are identifier plumbing (reading a value from `opts.` instead of closure) explicitly listed in the task.
- Typecheck gate: `bun run typecheck` currently reports **2 pre-existing errors** (baseline). After every task: error count ≤ 2 and no error may mention a file this plan touches.
- Test gate: `bun test` currently **24 pass / 0 fail** across 3 files. Never fewer.
- Do NOT run `bun db:push`, modify `instant.schema.ts`/`instant.perms.ts`, or push to origin.
- Commits: one per task, message given in the task. lint-staged/prettier runs on commit — accept its formatting.
- **Line anchors:** quoted line numbers refer to the file BEFORE this plan started (git `48d04c9`). They shift as tasks land — locate blocks by the quoted function name / comment anchor, not the number.
- **Move convention:** "Move verbatim" = cut the exact block from `page.tsx` and paste into the new file unchanged, then apply only the plumbing edits the task lists. If a moved block references a name that no longer resolves, the fix is always "add it to the hook's options object", never a rewrite.

---

### Task 1: Delete dead code inside page.tsx (non-generation)

**Files:**

- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`

**Interfaces:** none (pure deletion).

- [ ] **Step 1: Delete dead imports and commented-out import lines**

In the import block:

- Line 12: `import { Plus, Undo, Redo, SlidersHorizontal } from "lucide-react";` → `import { Undo, Redo } from "lucide-react";` (`Plus` only used by style dialog deleted below; `SlidersHorizontal` unused).
- Lines 20–26: delete the entire `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription` import (only the style dialog used it).
- Line 27: `import { styleActions, getDefaultStyle } from "@/lib/prompt-actions";` → `import { getDefaultStyle } from "@/lib/prompt-actions";`
- Delete commented imports: line 31 (`//import { ShortcutBadge }…`), line 37 (`//import { VideoControls }…`), line 71 (`//import { MiniMap }…`), line 76 (`//import { CanvasRightSidebar }…`).
- Line 85: delete `import Image from "next/image";` (only style dialog used it).

- [ ] **Step 2: Delete write-only / unreachable state and effects**

- Lines 114–116: the commented `visibleIndicators` state.
- Lines 126–128: `previousStyleId` state, and its tracking effect (anchor: `// Track previous style when changing styles`, lines 1296–1306).
- Line 173: commented `showMinimap` state; the two commented minimap localStorage effects (anchors: `// Load minimap setting` lines 1278–1284, `// Save minimap setting` lines 1291–1294).
- Line 174: `isStyleDialogOpen` state.
- Line 202: `const [_, setIsSaving] = useState(false);` — and inside `saveToStorage`: delete `setIsSaving(true);`, the `// Brief delay to show the indicator` comment + `setTimeout(() => setIsSaving(false), 300);`, and in the catch replace `setIsSaving(false);` with `console.error("[CANVAS] Failed to save canvas state:", error);` (the catch previously only reset the flag; keep the swallow, add the log so the catch isn't silent).
- Line 203: `showSuccess` state; line 216 `previousGenerationCount` state; the whole effect at lines 218–248 (anchor: `// Track when generation completes`). `showSuccess` is never read.

- [ ] **Step 3: Delete `resizeImageIfNeeded`**

Lines 1385–1446 (anchor: `// Helper function to resize image if too large`). Never called.

- [ ] **Step 4: Delete isolate debug code inside `handleIsolate`**

Inside the `if (result.url)` branch:

- The three `console.log` lines just above (anchors: `"Original image URL:"`, `"New isolated image URL:"`, `"Result object:"`).
- The `// AUTO DOWNLOAD FOR DEBUGGING` try/catch block (creates an `<a>`, clicks it).
- Inside `testImg.onload`: the `console.log("New image loaded successfully:"…)` call and the whole `// Create a test canvas to verify the image has transparency` block (from `const testCanvas = document.createElement("canvas");` through the closing brace of `if (testCtx) { … }`). The onload body must now start at `// Update the image in place with the segmented image` / `saveToHistory();`. **Do not** touch anything from `saveToHistory()` onward.

- [ ] **Step 5: Delete style dialog JSX and commented JSX blocks**

- The `{/* Style Selection Dialog */}` `<Dialog …>` block, lines 3493–3579 (from the comment through its closing `</Dialog>`).
- The commented `{/* Mini-map -- Disabled for now … */}` block (lines 3464–3473).
- The commented `{/* Right Sidebar - Hidden on mobile … */}` block (lines 3678–3707).

- [ ] **Step 6: Typecheck + tests**

Run: `bun run typecheck 2>&1 | grep -c "error TS"` → Expected: `2`, none mentioning `canvas/[id]/page.tsx`.
Run: `bun test` → Expected: 24 pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "refactor(canvas): delete dead state, style dialog, debug code from canvas page"
```

---

### Task 2: Delete the legacy image-generation path

`generation-handler.ts#handleRun` is exported but never imported; it is the only writer of `activeGenerations` and the only `setIsGenerating(true)` caller. Everything below is therefore unreachable or constant.

**Files:**

- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`
- Modify: `apps/web/src/lib/handlers/background-handler.ts:2`
- Delete: `apps/web/src/lib/handlers/generation-handler.ts`
- Delete: `apps/web/src/components/canvas/StreamingImage.tsx`
- Keep: `apps/web/src/hooks/useStreamingImage.ts` (used by `CanvasImage.tsx`).

**Interfaces:**

- Produces: page imports `uploadImageDirect` from `@/lib/handlers/generation-helpers` (same signature as before: `(dataUrl: string, falClient, toast) => Promise<{ url: string } | …>`). Later tasks (isolate extraction) rely on this import path.

- [ ] **Step 1: Remove legacy state and its references in page.tsx**

- Line 32: delete `import { StreamingImage } …`.
- In the types import (lines 45–53): remove `ActiveGeneration` from the list (keep `ActiveVideoGeneration` — the video pipeline is alive).
- Line 129: delete `isGenerating` state. Line 130–132: delete `activeGenerations` state.
- Delete every `setIsGenerating(false);` line (three occurrences inside `handleVideoGenerationComplete` / its catch / `handleVideoGenerationError`).
- Auto-save effect (anchor `// Auto-save to storage`): delete the line `if (activeGenerations.size > 0) return;` and remove `activeGenerations.size` from its dependency array.
- Keyboard shortcut (anchor `// Run generation`): `if (!isGenerating && generationSettings.prompt.trim())` → `if (generationSettings.prompt.trim())`. Remove `generationSettings` → keep (still used for prompt check); remove nothing else here.
- JSX: delete the whole `{/* Render streaming components for active generations */}` block (lines 2597–2688, the `Array.from(activeGenerations.entries()).map(…)` rendering `<StreamingImage>`).
- JSX: delete the `{/* Render generating placeholders for images */}` block (the `images.filter((image) => activeGenerations.has(image.id)).map(…)` rendering `GeneratingPlaceholder`) — keep the video-placeholder block below it and the agent `generatingSlot` placeholder.
- JSX images render filter: delete the leading
  ```tsx
  // Don't render images that are currently generating
  // (they'll be shown as placeholders instead)
  if (activeGenerations.has(image.id)) {
    return false;
  }
  ```
  keeping the visibility-culling logic that follows.
- Prop sites — pass literals (children unchanged in Phase 1):
  - `<CanvasContextMenu … isGenerating={false} …>`
  - `<MobileToolbar … isGenerating={false} …>`
  - `<PromptEditor … isGenerating={false} generationState="running" …>` — replace the whole multi-line ternary that computed `generationState` with the literal `"running"` (its only possible value once `activeGenerations` is empty and `isGenerating` is false). Add above it: `// ponytail: legacy streaming path deleted; wire agentStatus here when the Run button should reflect runs.`

- [ ] **Step 2: Retarget uploadImageDirect imports and delete dead files**

- page.tsx line 91: `from "@/lib/handlers/generation-handler"` → `from "@/lib/handlers/generation-helpers"`.
- `src/lib/handlers/background-handler.ts` line 2: `from "./generation-handler"` → `from "./generation-helpers"`.
- Verify then delete:

```bash
grep -rn "generation-handler" src --include="*.ts" --include="*.tsx"   # expect: no hits
grep -rln "components/canvas/StreamingImage" src                        # expect: no hits
git rm src/lib/handlers/generation-handler.ts src/components/canvas/StreamingImage.tsx
```

If either grep still shows a hit, fix that reference first — do not delete on faith.

- [ ] **Step 3: Typecheck + tests**

Run: `bun run typecheck 2>&1 | grep -c "error TS"` → Expected: `2`.
Run: `bun test` → Expected: 24 pass.

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "refactor(canvas): delete unreachable legacy image-generation path"
```

---

### Task 3: Move `createCroppedImage` + file-upload helper to utils

**Files:**

- Modify: `apps/web/src/utils/canvas-utils.ts` (append)
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`

**Interfaces:**

- Produces (in `@/utils/canvas-utils`):
  - `createCroppedImage(imageSrc: string, cropX: number, cropY: number, cropWidth: number, cropHeight: number): Promise<string>` — body moved verbatim from page.tsx (anchor `// Helper function to create a cropped image`).
  - `uploadFilesAsImages(files: FileList, position: { x: number; y: number } | undefined, viewport: { x: number; y: number; scale: number }, canvasSize: { width: number; height: number }, addImage: (img: PlacedImage) => void): void` — body of `handleFileUpload` moved verbatim, with `setImages((prev) => [...prev, {…}])` replaced by `addImage({…})`.

- [ ] **Step 1: Append both functions to `src/utils/canvas-utils.ts`**

Add imports at top of that file if missing: `import { id } from "@instantdb/react";` and `import type { PlacedImage } from "@/types/canvas";`. Then paste the two moved bodies with the signatures above. The only edits inside `uploadFilesAsImages`: the parameter list, and the `addImage` substitution shown above. `createCroppedImage` moves with zero edits.

- [ ] **Step 2: Rewire page.tsx**

Delete both function bodies from the page. Add to the page's imports from `@/utils/canvas-utils`: `createCroppedImage, uploadFilesAsImages` (the import line for `imageToCanvasElement, videoToCanvasElement` already exists — extend it). Replace `handleFileUpload` with:

```tsx
const handleFileUpload = (
  files: FileList | null,
  position?: { x: number; y: number },
) => {
  if (!files) return;
  uploadFilesAsImages(files, position, viewport, canvasSize, (img) =>
    setImages((prev) => [...prev, img]),
  );
};
```

`handleDrop` and the crop-overlay `onCropEnd` call sites are unchanged (they call the same names).

- [ ] **Step 3: Typecheck + tests + commit**

Run: `bun run typecheck 2>&1 | grep -c "error TS"` → `2`. Run: `bun test` → 24 pass.

```bash
git add src/utils/canvas-utils.ts "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "refactor(canvas): move crop/file-upload helpers to canvas-utils"
```

---

### Task 4: Extract `usePromptSync`

**Files:**

- Create: `apps/web/src/hooks/usePromptSync.ts`
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`

**Interfaces:**

- Produces:

```ts
export function usePromptSync(opts: {
  promptEditorRef: React.RefObject<PromptEditorHandle | null>;
  images: PlacedImage[];
  videos: PlacedVideo[];
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
}): {
  handleSelect: (
    id: string,
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
  ) => void;
  clearSelection: () => void; // clear prompt refs + selectedIds (empty-canvas click)
  onAssetReferencesChange: (assetIds: string[]) => void;
};
```

- Consumed by: Task 5's viewport hook (`onClearSelection: clearSelection`), page JSX (`handleSelect`, `onAssetReferencesChange`).

- [ ] **Step 1: Create the hook**

The hook owns `const syncSourceRef = useRef<"canvas" | "prompt" | null>(null);`. Move verbatim:

- `handleSelect` (anchor `// Handle selection`).
- `onAssetReferencesChange`: the inline callback currently passed to `<PromptEditor onAssetReferencesChange={…}>` — lift the function body as-is.
- `clearSelection`: extract from `handleMouseDown` the block starting `// Clear all asset references when clicking empty canvas` through the `setTimeout(() => { syncSourceRef.current = null; }, 0);` (includes `setSelectedIds([])`), wrapped as a function.

Reads of `images`, `videos`, `selectedIds`, `setSelectedIds`, `promptEditorRef` become `opts.` reads (or destructure at hook top).

- [ ] **Step 2: Rewire page.tsx**

```tsx
const { handleSelect, clearSelection, onAssetReferencesChange } = usePromptSync(
  { promptEditorRef, images, videos, selectedIds, setSelectedIds },
);
```

Delete the moved code; inside `handleMouseDown`, replace the extracted clearing block with `clearSelection();`; pass `onAssetReferencesChange={onAssetReferencesChange}` to `<PromptEditor>`. Delete the page-level `syncSourceRef`.

- [ ] **Step 3: Typecheck + tests + commit**

Gates as always (`2` errors / 24 pass).

```bash
git add src/hooks/usePromptSync.ts "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "refactor(canvas): extract usePromptSync hook"
```

---

### Task 5: Extract `useCanvasViewport`

**Files:**

- Create: `apps/web/src/hooks/useCanvasViewport.ts`
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`

**Interfaces:**

- Consumes: `clearSelection` from Task 4.
- Produces:

```ts
export type Viewport = { x: number; y: number; scale: number };

export function useCanvasViewport(opts: {
  stageRef: React.RefObject<Konva.Stage | null>;
  images: PlacedImage[];
  videos: PlacedVideo[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  isDraggingImage: boolean;
  croppingImageId: string | null;
  setCroppingImageId: React.Dispatch<React.SetStateAction<string | null>>;
  onClearSelection: () => void;
}): {
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  canvasSize: { width: number; height: number };
  isCanvasReady: boolean;
  isPanningCanvas: boolean;
  selectionBox: SelectionBox;
  handleWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void;
  handleMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  handleMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  handleMouseUp: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  handleMouseLeave: () => void;
  handleTouchStart: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  handleTouchMove: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  handleTouchEnd: (e: Konva.KonvaEventObject<TouchEvent>) => void;
};
```

- [ ] **Step 1: Create the hook**

Move verbatim into the hook: state `viewport`, `canvasSize`, `isCanvasReady`, `isPanningCanvas`, `lastPanPosition`, `selectionBox`, `isSelecting`, `lastTouchDistance`, `lastTouchCenter`, `isTouchingImage`; handlers `handleWheel`, `handleTouchStart/Move/End`, `handleMouseDown/Move/Up`; effects: canvas-ready (anchor `// Set canvas ready state after mount`), window-resize (anchor `// Update canvas size on window resize`), body-scroll-lock (anchor `// Prevent body scrolling on mobile`). Plumbing edits only:

- In `handleMouseDown`, the clearing block is already `opts.onClearSelection()` (Task 4); `croppingImageId`/`setCroppingImageId` read from opts.
- `handleMouseUp` marquee hit-testing reads `opts.images` / `opts.videos`; final `setSelectedIds` is `opts.setSelectedIds`. **Rename its local `const selectedIds = […]` to `const hitIds`** to avoid shadowing confusion (same values, same behavior).
- `handleTouchMove`'s gate reads `opts.isDraggingImage`.
- Add `handleMouseLeave`: `() => { if (isPanningCanvas) setIsPanningCanvas(false); };` (this is the current inline `onMouseLeave` body).

- [ ] **Step 2: Rewire page.tsx**

```tsx
const {
  viewport,
  setViewport,
  canvasSize,
  isCanvasReady,
  isPanningCanvas,
  selectionBox,
  handleWheel,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleMouseLeave,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd,
} = useCanvasViewport({
  stageRef,
  images,
  videos,
  setSelectedIds,
  isDraggingImage,
  croppingImageId,
  setCroppingImageId,
  onClearSelection: clearSelection,
});
```

Delete moved state/handlers/effects from the page. `<Stage>` props: `onMouseLeave={handleMouseLeave}` replaces the inline arrow; all other handler props keep their names. Everything else in the page that reads `viewport`/`canvasSize`/`setViewport` keeps working (they're returned).

- [ ] **Step 3: Typecheck + tests + commit**

Gates (`2` / 24).

```bash
git add src/hooks/useCanvasViewport.ts "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "refactor(canvas): extract useCanvasViewport hook"
```

---

### Task 6: Extract `useCanvasPersistence`

**Files:**

- Create: `apps/web/src/hooks/useCanvasPersistence.ts`
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`

**Interfaces:**

- Produces:

```ts
export function useCanvasPersistence(opts: {
  projectId: string;
  userId: string | null;
  sessionId: string | null | undefined; // pass what useAuth returns
  images: PlacedImage[];
  videos: PlacedVideo[];
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  setVideos: React.Dispatch<React.SetStateAction<PlacedVideo[]>>;
  viewport: Viewport; // from useCanvasViewport
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  agentStatus: ReturnType<typeof useAgentRun>["status"];
  projectElements: unknown[] | undefined; // project?.elements from db.useQuery
  toast: ReturnType<typeof useToast>;
}): {
  isStorageLoaded: boolean;
  saveToStorage: () => Promise<void>;
};
```

- [ ] **Step 1: Create the hook**

Move verbatim: `isStorageLoaded` state; `saveToStorage` (anchor `// Save current state to storage`); `loadFromStorage` (anchor `// Load state from storage`); effects: storage-init (anchor `// Initialize storage with user or session ID`), agent-done reload (anchor `// When an agent run completes, reload the canvas`), reactive merge (anchor `// Reactively merge server-side element inserts`), auto-save debounce (anchor `// Auto-save to storage when images or videos change`), visibility save (anchor `// Save canvas assets when page visibility changes`). Plumbing: `user?.id || null` → `opts.userId`; `project?.elements` → `opts.projectElements`; the merge effect's `const dbElements = (project?.elements ?? []) as any[];` → `(opts.projectElements ?? []) as any[]`; dependency arrays keep the same values via the opts names.

- [ ] **Step 2: Rewire page.tsx**

```tsx
const { isStorageLoaded, saveToStorage } = useCanvasPersistence({
  projectId,
  userId: user?.id || null,
  sessionId,
  images,
  videos,
  setImages,
  setVideos,
  viewport,
  setViewport,
  agentStatus,
  projectElements: project?.elements,
  toast,
});
```

Place this call AFTER `useCanvasViewport` (needs `viewport`) and after the `db.useQuery` for `project`. Delete moved code. Callers of `saveToStorage` (StreamingImage path is already deleted; remaining caller is none — the auto-save/visibility effects moved with it) — verify with `grep -n "saveToStorage" page.tsx`: only the hook destructure should remain; if other call sites exist, they keep working since the name is unchanged.

- [ ] **Step 3: Typecheck + tests + commit**

Gates (`2` / 24).

```bash
git add src/hooks/useCanvasPersistence.ts "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "refactor(canvas): extract useCanvasPersistence hook"
```

---

### Task 7: Extract `useIsolateObject`

**Files:**

- Create: `apps/web/src/hooks/useIsolateObject.ts`
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`

**Interfaces:**

- Produces:

```ts
export function useIsolateObject(opts: {
  images: PlacedImage[];
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  saveToHistory: () => void;
  falClient: ReturnType<typeof useFalClient>;
  isolateObject: (input: {
    imageUrl: string;
    textInput: string;
  }) => Promise<{ url: string | null }>;
  toast: ReturnType<typeof useToast>;
}): {
  isolateTarget: string | null;
  setIsolateTarget: React.Dispatch<React.SetStateAction<string | null>>;
  isolateInputValue: string;
  setIsolateInputValue: React.Dispatch<React.SetStateAction<string>>;
  isIsolating: boolean;
  handleIsolate: () => Promise<void>;
};
```

If tsc reports the `isolateObject` parameter type incompatible with the tRPC mutation's inferred output, adjust the parameter's return type to exactly the mutation's output type (mechanical widening — do not cast at the call site).

- [ ] **Step 1: Create the hook, move state trio + `handleIsolate` verbatim** (debug code already deleted in Task 1). `uploadImageDirect` import moves into the hook file (`@/lib/handlers/generation-helpers`).

- [ ] **Step 2: Rewire page.tsx**

```tsx
const {
  isolateTarget,
  setIsolateTarget,
  isolateInputValue,
  setIsolateInputValue,
  isIsolating,
  handleIsolate,
} = useIsolateObject({
  images,
  setImages,
  setSelectedIds,
  saveToHistory,
  falClient,
  isolateObject,
  toast,
});
```

The `ContextMenu onOpenChange` reset and `CanvasContextMenu` props keep the same names — no JSX change beyond deletion of moved code. Remove the page's `uploadImageDirect` import if now unused (grep first — `handleRemoveBackground` uses the background-handler, not this import).

- [ ] **Step 3: Typecheck + tests + commit**

Gates (`2` / 24).

```bash
git add src/hooks/useIsolateObject.ts "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "refactor(canvas): extract useIsolateObject hook"
```

---

### Task 8: Extract `useAgentGeneration`

**Files:**

- Create: `apps/web/src/hooks/useAgentGeneration.ts`
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`

**Interfaces:**

- Produces:

```ts
export type GeneratingSlot = {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: "image" | "video";
};

export function useAgentGeneration(opts: {
  projectId: string;
  images: PlacedImage[];
  videos: PlacedVideo[];
  generationSettings: GenerationSettings;
  startAgentRun: ReturnType<typeof useAgentRun>["start"];
  agentStatus: ReturnType<typeof useAgentRun>["status"];
}): {
  generatingSlot: GeneratingSlot | null;
  handleRun: () => Promise<void>;
};
```

- [ ] **Step 1: Create the hook.** Move verbatim: `generatingSlot` state (with its explanatory comment), `handleRun` (anchor `// Handle context menu actions` / `const handleRun`), the slot-landing effect (anchor `// Drive the in-canvas loading animation` — move the full comment block, it documents the ponytail ceiling), and the safety-net effect (anchor `// Safety net: never leave a placeholder stuck`). Imports `findOpenSpot, dimsForOutput, type Rect` from `@/lib/canvas-placement` and `getVideoModelById` from `@/lib/models-config` move with it (remove from page if unused there afterward — `getVideoModelById` IS still used by the video pipeline until Task 9; grep before removing).

- [ ] **Step 2: Rewire page.tsx**

```tsx
const { generatingSlot, handleRun } = useAgentGeneration({
  projectId,
  images,
  videos,
  generationSettings,
  startAgentRun,
  agentStatus,
});
```

JSX (`generatingSlot && <GeneratingPlaceholder …>`), keyboard shortcut, and all `handleRun` prop sites are name-stable.

- [ ] **Step 3: Typecheck + tests + commit**

Gates (`2` / 24).

```bash
git add src/hooks/useAgentGeneration.ts "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "refactor(canvas): extract useAgentGeneration hook"
```

---

### Task 9: Extract `useVideoGenerationPipeline`

The biggest move (~700 lines): all four dialog flows + streaming-completion handlers.

**Files:**

- Create: `apps/web/src/hooks/useVideoGenerationPipeline.ts`
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`

**Interfaces:**

- Produces (raw fields, so page JSX is unchanged except source — grouping into dialog objects is Phase-2 polish):

```ts
export function useVideoGenerationPipeline(opts: {
  images: PlacedImage[];
  videos: PlacedVideo[];
  setVideos: React.Dispatch<React.SetStateAction<PlacedVideo[]>>;
  saveToHistory: () => void;
  toast: ReturnType<typeof useToast>;
  falClient: ReturnType<typeof useFalClient>;
  userId: string | undefined;
  sessionId: string | null | undefined;
  refetchCredits: () => void;
  viewport: Viewport; // import type { Viewport } from "@/hooks/useCanvasViewport"
  canvasSize: { width: number; height: number };
}): {
  activeVideoGenerations: Map<string, ActiveVideoGeneration>;
  // context-menu openers
  handleConvertToVideo: (imageId: string) => void;
  handleVideoToVideo: (videoId: string) => void;
  handleExtendVideo: (videoId: string) => void;
  handleRemoveVideoBackground: (videoId: string) => void;
  // dialog state + submit handlers (names identical to current page locals)
  isImageToVideoDialogOpen: boolean;
  setIsImageToVideoDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedImageForVideo: string | null;
  setSelectedImageForVideo: React.Dispatch<React.SetStateAction<string | null>>;
  isConvertingToVideo: boolean;
  handleImageToVideoConversion: (s: VideoGenerationSettings) => Promise<void>;
  isVideoToVideoDialogOpen: boolean;
  setIsVideoToVideoDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedVideoForVideo: string | null;
  setSelectedVideoForVideo: React.Dispatch<React.SetStateAction<string | null>>;
  isTransformingVideo: boolean;
  handleVideoToVideoTransformation: (
    s: VideoGenerationSettings,
  ) => Promise<void>;
  isExtendVideoDialogOpen: boolean;
  setIsExtendVideoDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedVideoForExtend: string | null;
  setSelectedVideoForExtend: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  isExtendingVideo: boolean;
  handleVideoExtension: (s: VideoGenerationSettings) => Promise<void>;
  isRemoveVideoBackgroundDialogOpen: boolean;
  setIsRemoveVideoBackgroundDialogOpen: React.Dispatch<
    React.SetStateAction<boolean>
  >;
  selectedVideoForBackgroundRemoval: string | null;
  setSelectedVideoForBackgroundRemoval: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  isRemovingVideoBackground: boolean;
  handleVideoBackgroundRemoval: (backgroundColor: string) => Promise<void>;
  // StreamingVideo callbacks
  handleVideoGenerationComplete: (
    videoId: string,
    videoUrl: string,
    duration: number,
    referencedAssetIds?: string[],
  ) => Promise<void>;
  handleVideoGenerationError: (videoId: string, error: string) => void;
  handleVideoGenerationProgress: (
    videoId: string,
    progress: number,
    status: string,
  ) => void;
};
```

- [ ] **Step 1: Create the hook.** Move verbatim: the 13 state atoms (`activeVideoGenerations`, `isConvertingToVideo`, and the four dialogs' open/selected/busy trios) and the 11 functions listed in the return type (anchors: each has a `// Function to handle…` comment; `handleVideoGenerationComplete` is the 250-line one). Plumbing: `user?.id` → `opts.userId`; `sessionId` → `opts.sessionId`; `refetchCredits()`, `viewport`, `canvasSize`, `images`, `videos`, `setVideos`, `saveToHistory`, `toast`, `falClient` from opts. The dynamic `await import("@/lib/models-config")` calls move as-is. `convertImageToVideo` import moves to the hook; `id` from `@instantdb/react` is needed by both files (hook: new-video creation; page: file upload id) — import in both.

- [ ] **Step 2: Rewire page.tsx.** One destructure (all names identical to former locals), so the four dialog JSX blocks, `<StreamingVideo>` map, and `CanvasContextMenu` props compile unchanged:

```tsx
const videoPipeline = useVideoGenerationPipeline({
  images,
  videos,
  setVideos,
  saveToHistory,
  toast,
  falClient,
  userId: user?.id,
  sessionId,
  refetchCredits,
  viewport,
  canvasSize,
});
const {
  activeVideoGenerations,
  handleConvertToVideo,
  handleVideoToVideo,
  handleExtendVideo,
  handleRemoveVideoBackground,
  isImageToVideoDialogOpen,
  setIsImageToVideoDialogOpen,
  selectedImageForVideo,
  setSelectedImageForVideo,
  isConvertingToVideo,
  handleImageToVideoConversion,
  isVideoToVideoDialogOpen,
  setIsVideoToVideoDialogOpen,
  selectedVideoForVideo,
  setSelectedVideoForVideo,
  isTransformingVideo,
  handleVideoToVideoTransformation,
  isExtendVideoDialogOpen,
  setIsExtendVideoDialogOpen,
  selectedVideoForExtend,
  setSelectedVideoForExtend,
  isExtendingVideo,
  handleVideoExtension,
  isRemoveVideoBackgroundDialogOpen,
  setIsRemoveVideoBackgroundDialogOpen,
  selectedVideoForBackgroundRemoval,
  setSelectedVideoForBackgroundRemoval,
  isRemovingVideoBackground,
  handleVideoBackgroundRemoval,
  handleVideoGenerationComplete,
  handleVideoGenerationError,
  handleVideoGenerationProgress,
} = videoPipeline;
```

Then delete the moved code from the page and remove now-unused page imports (`convertImageToVideo`, `getVideoModelById` if grep shows no remaining use).

- [ ] **Step 3: Typecheck + tests + commit**

Gates (`2` / 24).

```bash
git add src/hooks/useVideoGenerationPipeline.ts "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "refactor(canvas): extract useVideoGenerationPipeline hook"
```

---

### Task 10: Extract `useSnapDragHandlers` (dedup) + pure helper with test

The image and video render maps contain near-identical 120-line inline `onDragMove`/`onDragStart`/`onDragEnd`. Dedup into one factory. This task contains actual logic consolidation, so it gets the plan's one new unit test.

**Files:**

- Create: `apps/web/src/hooks/useSnapDragHandlers.ts`
- Create: `apps/web/src/hooks/useSnapDragHandlers.test.ts`
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`

**Interfaces:**

- Produces:

```ts
// Pure: move every OTHER selected item by the dragged item's delta,
// anchored at each item's drag-start position.
export function applyDragDelta<T extends { id: string; x: number; y: number }>(
  items: T[],
  selectedIds: string[],
  draggedId: string,
  delta: { x: number; y: number },
  startPositions: Map<string, { x: number; y: number }>,
): T[];

export function useSnapDragHandlers(opts: {
  getSnapping: ReturnType<typeof useCanvasSnapping>["getSnapping"];
  updateGuideLines: ReturnType<typeof useCanvasSnapping>["updateGuideLines"];
  clearGuideLines: ReturnType<typeof useCanvasSnapping>["clearGuideLines"];
  selectedIds: string[];
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  images: PlacedImage[];
  videos: PlacedVideo[];
  setImages: React.Dispatch<React.SetStateAction<PlacedImage[]>>;
  setVideos: React.Dispatch<React.SetStateAction<PlacedVideo[]>>;
  dragStartPositions: Map<string, { x: number; y: number }>;
  setDragStartPositions: React.Dispatch<
    React.SetStateAction<Map<string, { x: number; y: number }>>
  >;
  setIsDraggingImage: React.Dispatch<React.SetStateAction<boolean>>;
  setHiddenVideoControlsIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  saveToHistory: () => void;
}): {
  imageDragHandlers: (image: PlacedImage) => {
    onDragMove: (
      e: unknown,
      newAttrs: Partial<PlacedImage>,
    ) => Partial<PlacedImage>;
    onDragStart: () => void;
    onDragEnd: () => void;
  };
  videoDragHandlers: (video: PlacedVideo) => {
    onDragMove: (
      e: unknown,
      newAttrs: Partial<PlacedVideo>,
    ) => Partial<PlacedVideo>;
    onDragStart: () => void;
    onDragEnd: () => void;
  };
};
```

**Behavioral contract (verify against current inline code while moving):**

- `onDragMove` returns the (possibly snapped) attrs — `CanvasImage`/`CanvasVideo` use the return value to position the Konva node. Preserve exact returns for both branches (guides present → snapped attrs; absent → `newAttrs`).
- `onDragStart`: select-if-unselected, `setIsDraggingImage(true)`, record start positions of all selected items of that kind; video additionally hides its controls (`setHiddenVideoControlsIds` add).
- `onDragEnd`: `setIsDraggingImage(false)`, `clearGuideLines()`, `saveToHistory()`, clear start positions; video additionally re-shows controls (delete from set).

- [ ] **Step 1: Write the failing test** (`src/hooks/useSnapDragHandlers.test.ts`):

```ts
import { test, expect } from "bun:test";
import { applyDragDelta } from "./useSnapDragHandlers";

const items = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 100, y: 100 },
  { id: "c", x: 200, y: 200 },
];
const starts = new Map([
  ["a", { x: 0, y: 0 }],
  ["b", { x: 100, y: 100 }],
]);

test("applyDragDelta moves other selected items by delta from their start positions", () => {
  const out = applyDragDelta(items, ["a", "b"], "a", { x: 10, y: -5 }, starts);
  expect(out.find((i) => i.id === "b")).toEqual({ id: "b", x: 110, y: 95 });
  // dragged item itself is NOT moved by this helper (Konva moves it)
  expect(out.find((i) => i.id === "a")).toEqual({ id: "a", x: 0, y: 0 });
  // unselected item untouched
  expect(out.find((i) => i.id === "c")).toEqual({ id: "c", x: 200, y: 200 });
});

test("applyDragDelta leaves selected items without a start position untouched", () => {
  const out = applyDragDelta(items, ["a", "c"], "a", { x: 10, y: 10 }, starts);
  expect(out.find((i) => i.id === "c")).toEqual({ id: "c", x: 200, y: 200 });
});
```

- [ ] **Step 2: Run it, expect failure** — `bun test src/hooks/useSnapDragHandlers.test.ts` → FAIL (module/function not found).

- [ ] **Step 3: Implement the hook.** `applyDragDelta` is the multi-select block currently duplicated inside both inline `onDragMove`s (`setImages((prev) => prev.map((img) => { if (selectedIds.includes(img.id) && img.id !== image.id) { const startPos = dragStartPositions.get(img.id); … }`), expressed as a pure map. The factory builds handlers generically over `(kind: "image" | "video")` choosing `{ items: images|videos, setItems: setImages|setVideos }` and the video-only hidden-controls calls; all other logic is the current inline code, written once. Konva event params are unused in the moved bodies except pass-through — type as `unknown`.

- [ ] **Step 4: Run the test** — `bun test src/hooks/useSnapDragHandlers.test.ts` → 2 pass.

- [ ] **Step 5: Rewire page.tsx.** In the images render map:

```tsx
<CanvasImage
  key={image.id}
  image={image}
  isSelected={selectedIds.includes(image.id)}
  onSelect={(e) => handleSelect(image.id, e)}
  onChange={(newAttrs) => {
    setImages((prev) =>
      prev.map((img) => (img.id === image.id ? { ...img, ...newAttrs } : img)),
    );
  }}
  {...imageDragHandlers(image)}
  onDoubleClick={() => setCroppingImageId(image.id)}
  selectedIds={selectedIds}
  images={images}
  setImages={setImages}
  isDraggingImage={isDraggingImage}
  isCroppingImage={croppingImageId === image.id}
  dragStartPositions={dragStartPositions}
/>
```

and the videos map keeps its `onResizeStart`/`onResizeEnd` props plus `{...videoDragHandlers(video)}` replacing its three inline drag props. Hook call above the JSX:

```tsx
const { imageDragHandlers, videoDragHandlers } = useSnapDragHandlers({
  getSnapping,
  updateGuideLines,
  clearGuideLines,
  selectedIds,
  setSelectedIds,
  images,
  videos,
  setImages,
  setVideos,
  dragStartPositions,
  setDragStartPositions,
  setIsDraggingImage,
  setHiddenVideoControlsIds,
  saveToHistory,
});
```

- [ ] **Step 6: Full gates** — `bun run typecheck 2>&1 | grep -c "error TS"` → `2`; `bun test` → 26 pass (24 + 2 new).

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useSnapDragHandlers.ts src/hooks/useSnapDragHandlers.test.ts "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "refactor(canvas): dedup snap-drag handlers into useSnapDragHandlers"
```

---

### Task 11: Extract `useCanvasShortcuts`

**Files:**

- Create: `apps/web/src/hooks/useCanvasShortcuts.ts`
- Modify: `apps/web/src/app/(authenticated)/canvas/[id]/page.tsx`

**Interfaces:**

- Produces:

```ts
export function useCanvasShortcuts(opts: {
  selectedIds: string[];
  images: PlacedImage[];
  generationSettings: GenerationSettings;
  croppingImageId: string | null;
  setCroppingImageId: React.Dispatch<React.SetStateAction<string | null>>;
  viewport: Viewport; // import type { Viewport } from "@/hooks/useCanvasViewport"
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  canvasSize: { width: number; height: number };
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  undo: () => void;
  redo: () => void;
  handleDelete: () => void;
  handleDuplicate: () => void;
  handleRun: () => Promise<void>;
  sendToFront: () => void;
  sendToBack: () => void;
  bringForward: () => void;
  sendBackward: () => void;
}): void;
```

- [ ] **Step 1: Create the hook** — move the whole keyboard effect (anchor `// Handle keyboard shortcuts`) verbatim, including the empty `handleKeyUp` and the dependency array (same value set, `opts.`-qualified). Reads become opts reads.

- [ ] **Step 2: Rewire page.tsx** — replace the effect with:

```tsx
useCanvasShortcuts({
  selectedIds,
  images,
  generationSettings,
  croppingImageId,
  setCroppingImageId,
  viewport,
  setViewport,
  canvasSize,
  setSelectedIds,
  undo,
  redo,
  handleDelete,
  handleDuplicate,
  handleRun,
  sendToFront,
  sendToBack,
  bringForward,
  sendBackward,
});
```

- [ ] **Step 3: Typecheck + tests + commit**

Gates (`2` / 26).

```bash
git add src/hooks/useCanvasShortcuts.ts "src/app/(authenticated)/canvas/[id]/page.tsx"
git commit -m "refactor(canvas): extract useCanvasShortcuts hook"
```

---

### Task 12: Final verification

**Files:** none (verification only; small fixups allowed if gates fail).

- [ ] **Step 1: Import hygiene** — in page.tsx, remove any import tsc/eslint flags as unused after all moves (`bun run lint 2>&1 | grep "canvas/\[id\]"` as a helper; fix only unused-import findings in touched files).

- [ ] **Step 2: Full gates**

```bash
bun run typecheck 2>&1 | grep -c "error TS"    # expect: 2
bun test                                        # expect: 26 pass, 0 fail
bun run build                                   # expect: success
wc -l "src/app/(authenticated)/canvas/[id]/page.tsx"   # expect: < 900
```

- [ ] **Step 3: Commit any hygiene fixups**

```bash
git add -A src && git commit -m "refactor(canvas): import hygiene after decomposition" || echo "nothing to commit"
```

- [ ] **Step 4: Report** — line-count before/after, hooks created, deletions, and the manual smoke checklist from the spec (pan/zoom incl. pinch + middle-mouse, marquee + shift-select, drag with snapping single + multi, crop double-click/escape, delete/undo/redo, file drop, agent run placeholder→asset, one video dialog flow, keyboard shortcuts).
