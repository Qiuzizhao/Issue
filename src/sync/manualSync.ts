import type { IssueItem, IssueProject } from '@/src/features/daily/issues/types';
import {
  listIssueProjectsForSync,
  listIssuesForSync,
  replaceIssueProjectsFromSync,
  replaceIssuesFromSync,
} from '@/src/local/repositories/issuesRepository';
import { getSettingsLocal, saveSettingsFromSync, type IssueSettings } from '@/src/local/settingsRepository';
import { getSyncMetadata, saveSyncMetadata } from '@/src/local/syncMetadataRepository';
import { mergeSyncRecords } from './syncMerge';
import { getCurrentSession, getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

type RemoteIssueProject = {
  id: string;
  user_id: string;
  project_key: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type RemoteIssueItem = {
  id: string;
  user_id: string;
  project_key: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  completed_at: string | null;
  due_date: string | null;
  due_time: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type RemoteSettings = {
  user_id: string;
  theme_primary_color: string;
  issue_projects_order: string[];
  updated_at: string;
};

export type ManualSyncResult =
  | { status: 'signedOut' }
  | {
      status: 'synced';
      uploadedProjects: number;
      downloadedProjects: number;
      uploadedIssues: number;
      downloadedIssues: number;
      uploadedSettings: boolean;
      downloadedSettings: boolean;
      syncedAt: string;
    };

function requiredTimestamp(value: string | null | undefined) {
  return value || new Date().toISOString();
}

function toRemoteProject(project: IssueProject, userId: string): RemoteIssueProject {
  const createdAt = requiredTimestamp(project.created_at);
  return {
    id: project.id,
    user_id: userId,
    project_key: project.key,
    name: project.name,
    created_at: createdAt,
    updated_at: requiredTimestamp(project.updated_at || createdAt),
    deleted_at: project.deleted_at ?? null,
  };
}

function toLocalProject(project: RemoteIssueProject): IssueProject {
  return {
    id: project.id,
    key: project.project_key,
    name: project.name,
    created_at: project.created_at,
    updated_at: project.updated_at,
    deleted_at: project.deleted_at,
    sync_status: 'synced',
  };
}

function toRemoteIssue(issue: IssueItem, userId: string): RemoteIssueItem {
  const createdAt = requiredTimestamp(issue.created_at);
  return {
    id: issue.id,
    user_id: userId,
    project_key: issue.project_key,
    title: issue.title,
    description: issue.description ?? null,
    is_completed: Boolean(issue.is_completed),
    completed_at: issue.completed_at ?? null,
    due_date: issue.due_date ?? null,
    due_time: issue.due_time ?? null,
    location: issue.location ?? null,
    created_at: createdAt,
    updated_at: requiredTimestamp(issue.updated_at || createdAt),
    deleted_at: issue.deleted_at ?? null,
  };
}

function toLocalIssue(issue: RemoteIssueItem): IssueItem {
  return {
    id: issue.id,
    client_sync_id: issue.id,
    project_key: issue.project_key,
    title: issue.title,
    description: issue.description,
    is_completed: Boolean(issue.is_completed),
    completed_at: issue.completed_at,
    due_date: issue.due_date,
    due_time: issue.due_time,
    location: issue.location,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    deleted_at: issue.deleted_at,
    sync_status: 'synced',
  };
}

function settingsTimestamp(settings: Pick<IssueSettings, 'updated_at'> | null | undefined) {
  const time = new Date(settings?.updated_at || '').getTime();
  return Number.isFinite(time) ? time : 0;
}

function toRemoteSettings(settings: IssueSettings, userId: string): RemoteSettings {
  return {
    user_id: userId,
    theme_primary_color: settings.theme_primary_color,
    issue_projects_order: settings.issue_projects_order,
    updated_at: settings.updated_at || new Date().toISOString(),
  };
}

export async function runManualSync(): Promise<ManualSyncResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('还没有配置 Supabase。请设置 EXPO_PUBLIC_SUPABASE_URL 和 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY。');
  }

  const session = await getCurrentSession();
  if (!session?.user) return { status: 'signedOut' };

  const supabase = getSupabaseClient();
  const userId = session.user.id;
  const syncedAt = new Date().toISOString();
  const [localProjects, localIssues, localSettings] = await Promise.all([
    listIssueProjectsForSync(),
    listIssuesForSync(),
    getSettingsLocal(),
  ]);
  const pendingProjects = localProjects.filter((project) => project.sync_status === 'pending' || project.sync_status === 'failed');
  const pendingIssues = localIssues.filter((issue) => issue.sync_status === 'pending' || issue.sync_status === 'failed');

  if (pendingProjects.length > 0) {
    const { error } = await supabase
      .from('issue_projects')
      .upsert(pendingProjects.map((project) => toRemoteProject(project, userId)), { onConflict: 'id' });
    if (error) throw error;
  }

  if (pendingIssues.length > 0) {
    const { error } = await supabase
      .from('issue_items')
      .upsert(pendingIssues.map((issue) => toRemoteIssue(issue, userId)), { onConflict: 'id' });
    if (error) throw error;
  }

  const { data: remoteProjectsData, error: remoteProjectsError } = await supabase
    .from('issue_projects')
    .select('id,user_id,project_key,name,created_at,updated_at,deleted_at')
    .eq('user_id', userId);
  if (remoteProjectsError) throw remoteProjectsError;

  const { data: remoteIssuesData, error: remoteIssuesError } = await supabase
    .from('issue_items')
    .select('id,user_id,project_key,title,description,is_completed,completed_at,due_date,due_time,location,created_at,updated_at,deleted_at')
    .eq('user_id', userId);
  if (remoteIssuesError) throw remoteIssuesError;

  const pendingProjectIds = new Set(pendingProjects.map((project) => project.id));
  const pendingIssueIds = new Set(pendingIssues.map((issue) => issue.id));
  const remoteProjects = ((remoteProjectsData ?? []) as RemoteIssueProject[]).map(toLocalProject);
  const remoteIssues = ((remoteIssuesData ?? []) as RemoteIssueItem[]).map(toLocalIssue);

  const mergedProjects = mergeSyncRecords(
    localProjects.map((project) => ({ ...project, sync_status: pendingProjectIds.has(project.id) ? 'synced' as const : project.sync_status })),
    remoteProjects
  ).map((project) => ({ ...project, sync_status: 'synced' as const }));

  const mergedIssues = mergeSyncRecords(
    localIssues.map((issue) => ({ ...issue, sync_status: pendingIssueIds.has(issue.id) ? 'synced' as const : issue.sync_status })),
    remoteIssues
  ).map((issue) => ({ ...issue, sync_status: 'synced' as const }));

  await Promise.all([
    replaceIssueProjectsFromSync(mergedProjects),
    replaceIssuesFromSync(mergedIssues),
  ]);

  const { data: remoteSettingsData, error: remoteSettingsError } = await supabase
    .from('issue_settings')
    .select('user_id,theme_primary_color,issue_projects_order,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (remoteSettingsError) throw remoteSettingsError;

  const remoteSettings = remoteSettingsData as RemoteSettings | null;
  const shouldUploadSettings = localSettings.sync_status === 'pending' || localSettings.sync_status === 'failed' || !remoteSettings;
  let uploadedSettings = false;

  if (shouldUploadSettings) {
    const { error } = await supabase
      .from('issue_settings')
      .upsert(toRemoteSettings(localSettings, userId), { onConflict: 'user_id' });
    if (error) throw error;
    uploadedSettings = true;
  }

  const { data: nextRemoteSettingsData, error: nextRemoteSettingsError } = await supabase
    .from('issue_settings')
    .select('user_id,theme_primary_color,issue_projects_order,updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (nextRemoteSettingsError) throw nextRemoteSettingsError;

  const nextRemoteSettings = nextRemoteSettingsData as RemoteSettings | null;
  const downloadedSettings = Boolean(nextRemoteSettings && settingsTimestamp(nextRemoteSettings) > settingsTimestamp(localSettings));
  if (nextRemoteSettings && settingsTimestamp(nextRemoteSettings) >= settingsTimestamp(localSettings)) {
    await saveSettingsFromSync({
      theme_primary_color: nextRemoteSettings.theme_primary_color,
      issue_projects_order: nextRemoteSettings.issue_projects_order || [],
      updated_at: nextRemoteSettings.updated_at,
      sync_status: 'synced',
    });
  } else {
    await saveSettingsFromSync(localSettings);
  }

  await saveSyncMetadata({ ...(await getSyncMetadata()), last_synced_at: syncedAt });

  return {
    status: 'synced',
    uploadedProjects: pendingProjects.length,
    downloadedProjects: remoteProjects.length,
    uploadedIssues: pendingIssues.length,
    downloadedIssues: remoteIssues.length,
    uploadedSettings,
    downloadedSettings,
    syncedAt,
  };
}
