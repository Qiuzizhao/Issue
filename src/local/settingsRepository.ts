import type { SyncStatus } from '@/src/features/daily/issues/types';
import { localKeys } from './keys';
import { getJson, setJson } from './storage';

export type IssueSettings = {
  theme_primary_color: string;
  issue_projects_order: string[];
  updated_at: string;
  sync_status: SyncStatus;
};

export const defaultThemePrimaryColor = '#E03131';

export function normalizeIssueSettings(value?: Partial<IssueSettings> | null): IssueSettings {
  return {
    theme_primary_color: value?.theme_primary_color || defaultThemePrimaryColor,
    issue_projects_order: Array.isArray(value?.issue_projects_order) ? value.issue_projects_order : [],
    updated_at: value?.updated_at || new Date().toISOString(),
    sync_status: value?.sync_status === 'synced' || value?.sync_status === 'failed' ? value.sync_status : 'pending',
  };
}

export async function getSettingsLocal() {
  return normalizeIssueSettings(await getJson<Partial<IssueSettings>>(localKeys.settings, normalizeIssueSettings()));
}

export async function saveSettingsLocal(settings: Partial<IssueSettings>) {
  const nextSettings = normalizeIssueSettings({
    ...(await getSettingsLocal()),
    ...settings,
    updated_at: new Date().toISOString(),
    sync_status: 'pending',
  });
  await setJson(localKeys.settings, nextSettings);
  return nextSettings;
}

export async function saveSettingsFromSync(settings: Partial<IssueSettings>) {
  const nextSettings = {
    ...normalizeIssueSettings(settings),
    sync_status: 'synced' as const,
  };
  await setJson(localKeys.settings, nextSettings);
  return nextSettings;
}

export async function resetSettingsLocal() {
  const nextSettings = normalizeIssueSettings({
    theme_primary_color: defaultThemePrimaryColor,
    issue_projects_order: [],
    sync_status: 'synced',
  });
  await setJson(localKeys.settings, nextSettings);
  return nextSettings;
}
