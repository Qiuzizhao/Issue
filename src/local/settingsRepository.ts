import type { SyncStatus } from '@/src/features/daily/issues/types';
import { localKeys } from './keys';
import { getJson, setJson } from './storage';

export type IssueSettings = {
  theme_primary_color: string;
  issue_projects_order: string[];
  /** 新建 Issue 时的默认项目 key（空表示收件箱优先） */
  default_project_key: string;
  /** 新建 Issue 时的默认类型 */
  default_issue_type: 'bug' | 'feature' | 'chore' | 'docs' | 'ui';
  /** 新建的 Issue 先进收件箱，之后再归类 */
  inbox_first: boolean;
  updated_at: string;
  sync_status: SyncStatus;
};

export const defaultThemePrimaryColor = '#3E63DD';

export function normalizeIssueSettings(value?: Partial<IssueSettings> | null): IssueSettings {
  return {
    theme_primary_color: value?.theme_primary_color || defaultThemePrimaryColor,
    issue_projects_order: Array.isArray(value?.issue_projects_order) ? value.issue_projects_order : [],
    default_project_key: typeof value?.default_project_key === 'string' ? value.default_project_key : '',
    default_issue_type: (['bug', 'feature', 'chore', 'docs', 'ui'] as const).includes(value?.default_issue_type as never)
      ? (value!.default_issue_type as IssueSettings['default_issue_type'])
      : 'bug',
    inbox_first: typeof value?.inbox_first === 'boolean' ? value.inbox_first : false,
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
