import { useEffect } from 'react';
import { AppState } from 'react-native';

import { subscribeLocalMode } from '@/src/local/localMode';
import { startAutoSync } from './autoSyncLifecycle';
import { runManualSync, subscribeSync } from './manualSync';
import { useThemeSettings } from '@/src/shared/theme';
import { getCurrentSession, getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export function AutoSync() {
  const { refreshThemeFromSettings } = useThemeSettings();
  useEffect(() => subscribeSync((state) => {
    if (state.status === 'succeeded' && state.result?.status === 'synced') {
      void refreshThemeFromSettings().catch(() => undefined);
    }
  }), [refreshThemeFromSettings]);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    return startAutoSync({
      getUserId: async () => (await getCurrentSession())?.user.id ?? null,
      subscribeUser: (listener) => {
        const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) => {
          listener(session?.user.id ?? null);
        });
        return () => data.subscription.unsubscribe();
      },
      currentAppState: () => AppState.currentState,
      subscribeAppState: (listener) => {
        const subscription = AppState.addEventListener('change', listener);
        return () => subscription.remove();
      },
      subscribeLocalMode,
      sync: runManualSync,
    });
  }, []);
  return null;
}
