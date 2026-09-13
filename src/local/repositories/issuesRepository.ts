import type { IssueItem, IssueProject, SyncStatus } from '@/src/features/daily/issues/types';
import { localKeys } from '../keys';
import { getSettingsLocal, saveSettingsLocal } from '../settingsRepository';
import { getCachedList, setCachedList } from './localListCache';

type StoredProject = Partial<IssueProject> & { id?: string | number };
type StoredIssue = Partial<IssueItem> & { id?: string | number };

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeId(id: string | number | undefined, prefix: string, fallback: number) {
  if (typeof id === 'string' && id.trim()) return id;
  if (typeof id === 'number' && Number.isFinite(id)) return `${prefix}-legacy-${id}`;
  return `${prefix}-legacy-${fallback}`;
}

function normalizeSyncStatus(status: unknown): SyncStatus {
  return status === 'synced' || status === 'failed' ? status : 'pending';
}

export function normalizeIssueProject(value: StoredProject, index = 0): IssueProject {
  const now = new Date().toISOString();
  const createdAt = typeof value.created_at === 'string' && value.created_at ? value.created_at : now;
  const id = normalizeId(value.id, 'issue-project', index + 1);
  return {
    id,
    key: typeof value.key === 'string' && value.key ? value.key : id,
    name: String(value.name || '未命名项目'),
    created_at: createdAt,
    updated_at: typeof value.updated_at === 'string' && value.updated_at ? value.updated_at : createdAt,
    deleted_at: typeof value.deleted_at === 'string' ? value.deleted_at : null,
    sync_status: normalizeSyncStatus(value.sync_status),
  };
}

export function normalizeIssueItem(value: StoredIssue, index = 0): IssueItem {
  const now = new Date().toISOString();
  const createdAt = typeof value.created_at === 'string' && value.created_at ? value.created_at : now;
  const id = normalizeId(value.id, 'issue', index + 1);
  return {
    id,
    client_sync_id: typeof value.client_sync_id === 'string' ? value.client_sync_id : id,
    project_key: String(value.project_key || ''),
    title: String(value.title || ''),
    description: value.description ?? null,
    is_completed: Boolean(value.is_completed),
    completed_at: value.completed_at ?? null,
    due_date: value.due_date ?? null,
    due_time: value.due_time ?? null,
    location: value.location ?? null,
    created_at: createdAt,
    updated_at: typeof value.updated_at === 'string' && value.updated_at ? value.updated_at : createdAt,
    deleted_at: typeof value.deleted_at === 'string' ? value.deleted_at : null,
    sync_status: normalizeSyncStatus(value.sync_status),
  };
}

async function readIssueProjectsLocal() {
  const stored = await getCachedList<StoredProject>(localKeys.issueProjects);
  const normalized = stored.map(normalizeIssueProject);
  const changed = JSON.stringify(stored) !== JSON.stringify(normalized);
  if (changed) await setCachedList<IssueProject>(localKeys.issueProjects, normalized);
  return normalized;
}

async function readIssuesLocal() {
  const stored = await getCachedList<StoredIssue>(localKeys.issues);
  const normalized = stored.map(normalizeIssueItem);
  const changed = JSON.stringify(stored) !== JSON.stringify(normalized);
  if (changed) await setCachedList<IssueItem>(localKeys.issues, normalized);
  return normalized;
}

async function sortProjectsByLocalOrder(items: IssueProject[]) {
  const settings = await getSettingsLocal();
  const order = settings.issue_projects_order || [];
  const orderMap = new Map(order.map((key, index) => [key, index]));
  return [...items].sort((a, b) => {
    const orderA = orderMap.get(a.key) ?? Infinity;
    const orderB = orderMap.get(b.key) ?? Infinity;
    if (orderA === orderB) return String(a.created_at || '').localeCompare(String(b.created_at || ''));
    return orderA - orderB;
  });
}

export async function listIssueProjectsLocal() {
  return sortProjectsByLocalOrder((await readIssueProjectsLocal()).filter((project) => !project.deleted_at));
}

export async function listIssueProjectsForSync() {
  return readIssueProjectsLocal();
}

export async function listIssuesLocal() {
  return (await readIssuesLocal()).filter((issue) => !issue.deleted_at);
}

export async function listIssuesForSync() {
  return readIssuesLocal();
}

export async function replaceIssueProjectsFromSync(items: IssueProject[]) {
  await setCachedList<IssueProject>(
    localKeys.issueProjects,
    items.map((item, index) => ({
      ...normalizeIssueProject(item, index),
      sync_status: 'synced' as const,
    }))
  );
}

export async function replaceIssuesFromSync(items: IssueItem[]) {
  await setCachedList<IssueItem>(
    localKeys.issues,
    items.map((item, index) => ({
      ...normalizeIssueItem(item, index),
      sync_status: 'synced' as const,
    }))
  );
}

export async function clearIssueDataLocal() {
  await Promise.all([
    setCachedList<IssueProject>(localKeys.issueProjects, []),
    setCachedList<IssueItem>(localKeys.issues, []),
  ]);
}

export async function reorderIssueProjectsLocal(keys: string[]) {
  const projects = await readIssueProjectsLocal();
  const visibleKeys = keys.filter((key) => projects.some((item) => item.key === key && !item.deleted_at));
  await saveSettingsLocal({ issue_projects_order: visibleKeys });
  return listIssueProjectsLocal();
}

export async function createIssueProjectLocal(name: string) {
  const projects = await readIssueProjectsLocal();
  const now = new Date().toISOString();
  const id = createId('issue-project');
  const item: IssueProject = {
    id,
    key: `project_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    sync_status: 'pending',
  };
  await setCachedList(localKeys.issueProjects, [...projects, item]);
  const settings = await getSettingsLocal();
  await saveSettingsLocal({ issue_projects_order: [...settings.issue_projects_order, item.key] });
  return item;
}

export async function updateIssueProjectLocal(id: string, name: string) {
  const projects = await readIssueProjectsLocal();
  let updated: IssueProject | null = null;
  const now = new Date().toISOString();
  const next = projects.map((item) => {
    if (item.id !== id) return item;
    updated = { ...item, name, updated_at: now, sync_status: 'pending' };
    return updated;
  });
  await setCachedList(localKeys.issueProjects, next);
  return updated;
}

export async function deleteIssueProjectLocal(project: IssueProject) {
  const [projects, issues] = await Promise.all([readIssueProjectsLocal(), readIssuesLocal()]);
  const now = new Date().toISOString();
  await setCachedList(localKeys.issueProjects, projects.map((item) => (
    item.id === project.id ? { ...item, deleted_at: now, updated_at: now, sync_status: 'pending' as const } : item
  )));
  await setCachedList(localKeys.issues, issues.map((item) => (
    item.project_key === project.key ? { ...item, deleted_at: now, updated_at: now, sync_status: 'pending' as const } : item
  )));
  const settings = await getSettingsLocal();
  await saveSettingsLocal({ issue_projects_order: settings.issue_projects_order.filter((key) => key !== project.key) });
}

export async function createIssueLocal(payload: Partial<IssueItem>) {
  const projectKey = String(payload.project_key || '');
  if (!projectKey) throw new Error('请先创建并选择项目');
  const issues = await readIssuesLocal();
  const now = new Date().toISOString();
  const id = createId('issue');
  const item: IssueItem = {
    id,
    client_sync_id: id,
    project_key: projectKey,
    title: String(payload.title || ''),
    is_completed: Boolean(payload.is_completed),
    completed_at: payload.completed_at ?? (payload.is_completed ? now : null),
    description: payload.description ?? null,
    due_date: payload.due_date ?? null,
    due_time: payload.due_time ?? null,
    location: payload.location ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    sync_status: 'pending',
  };
  await setCachedList(localKeys.issues, [item, ...issues]);
  return item;
}

export async function updateIssueLocal(id: string, payload: Partial<IssueItem>) {
  const issues = await readIssuesLocal();
  let updated: IssueItem | null = null;
  const now = new Date().toISOString();
  const next = issues.map((item) => {
    if (item.id !== id) return item;
    updated = { ...item, ...payload, updated_at: now, sync_status: 'pending' };
    return updated;
  });
  await setCachedList(localKeys.issues, next);
  return updated;
}

export async function deleteIssueLocal(id: string) {
  const issues = await readIssuesLocal();
  const now = new Date().toISOString();
  await setCachedList(localKeys.issues, issues.map((item) => (
    item.id === id
      ? { ...item, deleted_at: now, updated_at: now, sync_status: 'pending' as const }
      : item
  )));
}
