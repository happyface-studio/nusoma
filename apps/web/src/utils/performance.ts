// Performance utility functions for debouncing and throttling

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

// Coalesces high-frequency value updates (wheel/pinch/pan events fire faster
// than the display refreshes) into at most one commit per animation frame.
// current() returns the pending value mid-frame so each event computes from
// the latest value instead of the last-committed one; sync() feeds external
// commits (e.g. React state set elsewhere) back in as the fallback.
export function createFrameCoalescer<T>(commit: (value: T) => void): {
  current: () => T;
  queue: (next: T) => void;
  sync: (value: T) => void;
  cancel: () => void;
} {
  let synced: T;
  let pending: T | null = null;
  let rafId: number | null = null;

  return {
    current: () => pending ?? synced,
    queue: (next: T) => {
      pending = next;
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (pending !== null) {
            commit(pending);
            pending = null;
          }
        });
      }
    },
    sync: (value: T) => {
      synced = value;
    },
    cancel: () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  let lastArgs: Parameters<T> | null = null;

  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;

      setTimeout(() => {
        inThrottle = false;
        if (lastArgs !== null) {
          func(...lastArgs);
          lastArgs = null;
        }
      }, limit);
    } else {
      lastArgs = args;
    }
  };
}
