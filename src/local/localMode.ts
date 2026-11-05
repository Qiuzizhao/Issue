import AsyncStorage from '@react-native-async-storage/async-storage';

// Device preference: never upload this value as part of account settings.
const key = 'issue.local.localMode';
const listeners = new Set<(enabled: boolean) => void>();

export async function getLocalMode() {
  return (await AsyncStorage.getItem(key)) === 'true';
}

export async function setLocalMode(enabled: boolean) {
  await AsyncStorage.setItem(key, String(enabled));
  for (const listener of listeners) listener(enabled);
}

export function subscribeLocalMode(listener: (enabled: boolean) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
