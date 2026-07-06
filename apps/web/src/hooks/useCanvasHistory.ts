import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { db } from "@/lib/db";
import { id } from "@instantdb/react";
import type { PlacedImage, PlacedVideo } from "@/types/canvas";

export interface HistoryState {
  images: PlacedImage[];
  videos?: PlacedVideo[]; // Optional for backward compatibility
  selectedIds: string[];
  timestamp?: Date; // Optional timestamp from database
}

interface UseCanvasHistoryProps {
  projectId: string | null;
  images: any[];
  videos: any[];
  selectedIds: string[];
  onRestore: (state: HistoryState) => void;
}

export function useCanvasHistory({
  projectId,
  images,
  videos,
  selectedIds,
  onRestore,
}: UseCanvasHistoryProps) {
  const [currentHistoryIndex, setCurrentHistoryIndex] = useState(-1);
  const prevProjectIdRef = useRef<string | null>(null);

  // Reset history index when projectId changes
  useEffect(() => {
    if (prevProjectIdRef.current !== projectId) {
      setCurrentHistoryIndex(-1);
      prevProjectIdRef.current = projectId;
    }
  }, [projectId]);

  const { data: historyData } = db.useQuery(
    projectId
      ? {
          canvasHistory: {
            $: {
              where: { "project.id": projectId },
              order: { order: "asc" },
            },
          },
        }
      : { canvasHistory: { $: { where: { id: "__none__" } } } },
  );

  // Memoize history array to avoid recreating on every render
  const history = useMemo(
    () =>
      historyData?.canvasHistory?.map((snapshot: any) => ({
        id: snapshot.id,
        order: snapshot.order,
        ...(snapshot.snapshotData as HistoryState),
        timestamp: snapshot.timestamp,
      })) || [],
    [historyData?.canvasHistory],
  );

  const historyIndex = useMemo(
    () =>
      currentHistoryIndex === -1 && history.length > 0
        ? history.length - 1
        : currentHistoryIndex,
    [currentHistoryIndex, history.length],
  );

  const saveToHistory = useCallback(async () => {
    if (!projectId) return;

    const newState: HistoryState = {
      images: [...images],
      videos: [...videos],
      selectedIds: [...selectedIds],
    };

    try {
      // Use existing history data instead of querying again
      const currentHistory = historyData?.canvasHistory || [];
      const currentIndex =
        currentHistoryIndex >= 0
          ? currentHistoryIndex
          : currentHistory.length - 1;

      // Collect all transactions to batch them
      const transactions: any[] = [];

      // Truncate history if we're not at the end (removing "redo" items)
      if (currentIndex < currentHistory.length - 1) {
        const toDelete = currentHistory.slice(currentIndex + 1);
        for (const snapshot of toDelete) {
          transactions.push(db.tx.canvasHistory[snapshot.id].delete());
        }
      }

      // Limit history to last 50 snapshots to avoid excessive data
      const MAX_HISTORY_SNAPSHOTS = 50;
      const remainingCount = currentIndex + 1;
      if (remainingCount >= MAX_HISTORY_SNAPSHOTS) {
        const toRemove = remainingCount - MAX_HISTORY_SNAPSHOTS + 1;
        const snapshotsToRemove = currentHistory.slice(0, toRemove);
        for (const snapshot of snapshotsToRemove) {
          transactions.push(db.tx.canvasHistory[snapshot.id].delete());
        }
      }

      // Add new snapshot
      const snapshotId = id();
      const newOrder =
        Math.max(...currentHistory.map((s: any) => s.order || 0), -1) + 1;

      transactions.push(
        db.tx.canvasHistory[snapshotId].update({
          snapshotData: newState,
          timestamp: new Date(),
          order: newOrder,
        }),
        db.tx.canvasHistory[snapshotId].link({ project: projectId }),
      );

      // Execute all transactions in a single batch
      await db.transact(transactions);

      // Update current index to point to the end (new snapshot will be last)
      // Use -1 to let it auto-resolve to the latest on next render
      setCurrentHistoryIndex(-1);
    } catch (error) {
      console.error("Failed to save history:", error);
    }
  }, [
    images,
    videos,
    selectedIds,
    projectId,
    currentHistoryIndex,
    historyData?.canvasHistory,
  ]);

  // Undo - just update the index and restore state from InstantDB history
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      if (prevState) {
        onRestore(prevState);
        setCurrentHistoryIndex(historyIndex - 1);
      }
    }
  }, [history, historyIndex, onRestore]);

  // Redo - just update the index and restore state from InstantDB history
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      if (nextState) {
        onRestore(nextState);
        setCurrentHistoryIndex(historyIndex + 1);
      }
    }
  }, [history, historyIndex, onRestore]);

  // Restore to a specific history index
  const restoreHistory = useCallback(
    (index: number) => {
      if (index >= 0 && index < history.length) {
        const state = history[index];
        if (state) {
          onRestore(state);
          setCurrentHistoryIndex(index);
        }
      }
    },
    [history, onRestore],
  );

  // Initialize history index when history loads from DB
  useEffect(() => {
    if (currentHistoryIndex === -1 && history.length > 0) {
      setCurrentHistoryIndex(history.length - 1);
    }
  }, [history.length, currentHistoryIndex]);

  // Track if we've saved the initial state for this project
  const initialSaveRef = useRef<string | null>(null);

  // Save initial state only once per project
  useEffect(() => {
    if (
      history.length === 0 &&
      projectId &&
      initialSaveRef.current !== projectId
    ) {
      initialSaveRef.current = projectId;
      saveToHistory();
    }
  }, [history.length, projectId, saveToHistory]);

  return {
    history,
    historyIndex,
    saveToHistory,
    undo,
    redo,
    restoreHistory,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
  };
}
