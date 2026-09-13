import type { IssueItem } from '@/src/features/daily/issues/types';
import { clearIssueDataLocal, listIssuesLocal } from './repositories/issuesRepository';
import { getSettingsLocal, resetSettingsLocal, type IssueSettings } from './settingsRepository';
import { clearSyncMetadata, getSyncMetadata, type SyncMetadata } from './syncMetadataRepository';

export type LocalMergeSummary = {
  shouldConfirm: boolean;
  issueCount: number;
  hasSettingsChanges: boolean;
};

export function buildLocalMergeSummary(
  issues: IssueItem[],
  settings: IssueSettings,
  metadata: SyncMetadata
): LocalMergeSummary {
  const issueCount = issues.filter((issue) => !issue.deleted_at).length;
  const hasSettingsChanges = settings.sync_status === 'pending' || settings.sync_status === 'failed';
  return {
    shouldConfirm: !metadata.last_synced_at && (issueCount > 0 || hasSettingsChanges),
    issueCount,
    hasSettingsChanges,
  };
}

export async function getLocalMergeSummary() {
  const [issues, settings, metadata] = await Promise.all([listIssuesLocal(), getSettingsLocal(), getSyncMetadata()]);
  return buildLocalMergeSummary(issues, settings, metadata);
}

export async function clearAccountLocalData() {
  const [, settings, metadata] = await Promise.all([
    clearIssueDataLocal(),
    resetSettingsLocal(),
    clearSyncMetadata(),
  ]);
  return { settings, metadata };
}
