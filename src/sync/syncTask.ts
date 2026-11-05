import type { SyncProgress, SyncProgressListener } from './syncProgress';

export type SyncTaskState<Result> = {
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  progress: SyncProgress | null;
  result?: Result;
  error?: unknown;
};

/** One process-wide pipeline; all callers share its promise and current progress. */
export function createSyncTask<Result>(execute: (report: SyncProgressListener) => Promise<Result>) {
  let current: Promise<Result> | null = null;
  let state: SyncTaskState<Result> = { status: 'idle', progress: null };
  const listeners = new Set<(state: SyncTaskState<Result>) => void>();
  const notify = () => {
    for (const listener of listeners) {
      // A UI subscriber must never fail the underlying sync.
      try { listener(state); } catch { /* Detached or failing UI observer. */ }
    }
  };
  const subscribe = (listener: (state: SyncTaskState<Result>) => void) => {
    listeners.add(listener);
    try { listener(state); } catch { /* Keep the shared task independent of its UI. */ }
    return () => { listeners.delete(listener); };
  };

  function run({ onProgress }: { onProgress?: SyncProgressListener } = {}) {
    if (!current) {
      state = { status: 'running', progress: null };
      current = Promise.resolve().then(() => execute((progress) => {
        state = { ...state, progress };
        notify();
      })).then((result) => {
        current = null;
        state = { ...state, status: 'succeeded', result };
        notify();
        return result;
      }, (error: unknown) => {
        current = null;
        state = { ...state, status: 'failed', error };
        notify();
        throw error;
      });
      notify();
    }
    const task = current;
    if (onProgress) {
      const unsubscribe = subscribe((next) => {
        if (next.progress) onProgress(next.progress);
      });
      void task.then(unsubscribe, unsubscribe);
    }
    return task;
  }

  return { run, subscribe, getState: () => state, getRunningTask: () => current };
}
