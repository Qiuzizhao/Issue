type Dependencies = {
  getUserId: () => Promise<string | null>;
  subscribeUser: (listener: (id: string | null) => void) => () => void;
  currentAppState: () => string | null;
  subscribeAppState: (listener: (state: string) => void) => () => void;
  subscribeLocalMode: (listener: (enabled: boolean) => void) => () => void;
  sync: () => Promise<unknown>;
};

/** Native event adapters live in AutoSync; this lifecycle is independently testable. */
export function startAutoSync(deps: Dependencies) {
  let disposed = false;
  // iOS may start as inactive (or null while the native state is loading).
  // Wait for its first active event instead of syncing before foreground startup.
  let active = deps.currentAppState() === 'active';
  let userId: string | null = null;
  let authObserved = false;
  let scheduled: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (disposed || !active || !userId || scheduled !== null) return;
    // Leave Supabase's auth callback before getSession() can acquire its auth lock.
    scheduled = setTimeout(() => {
      scheduled = null;
      if (!disposed && active && userId) void deps.sync().catch(() => undefined);
    }, 0);
  };
  const updateUser = (id: string | null) => {
    if (disposed) return;
    const changed = userId !== id;
    userId = id;
    if (changed && id) schedule();
  };
  const unsubscribeUser = deps.subscribeUser((id) => {
    authObserved = true;
    updateUser(id);
  });
  void deps.getUserId().then((id) => {
    // A newer auth event takes precedence over a delayed bootstrap result.
    if (!authObserved) updateUser(id);
  }).catch(() => undefined);
  const unsubscribeAppState = deps.subscribeAppState((state) => {
    if (state === 'background') active = false;
    if (state === 'active' && !active) {
      active = true;
      schedule();
    }
  });
  const unsubscribeLocalMode = deps.subscribeLocalMode((enabled) => {
    if (!enabled) schedule();
  });
  return () => {
    disposed = true;
    if (scheduled !== null) clearTimeout(scheduled);
    unsubscribeUser();
    unsubscribeAppState();
    unsubscribeLocalMode();
  };
}
