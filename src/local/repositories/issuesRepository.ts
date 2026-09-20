import type {
  IssueItem,
  IssuePriority,
  IssueProject,
  IssueStatus,
  IssueType,
  SyncStatus,
} from '@/src/features/daily/issues/types';
import { projectColors } from '@/src/theme';
import { localKeys } from '../keys';
import { getSettingsLocal, saveSettingsLocal } from '../settingsRepository';
import { getCachedList, setCachedList } from './localListCache';

const issueTypes: IssueType[] = ['bug', 'feature', 'chore', 'docs', 'ui'];
const issuePriorities: IssuePriority[] = ['P0', 'P1', 'P2', 'P3'];
const issueStatuses: IssueStatus[] = ['open', 'in_progress', 'done'];
/** 早期版本的 blocked / wontfix 已下线，统一并入「待处理」 */
const legacyStatusAliases: Record<string, IssueStatus> = {
  blocked: 'open',
  wontfix: 'open',
};

/** 规范化只需在进程内做一次，之后读取直接命中内存缓存 */
let projectsHydrated = false;
let issuesHydrated = false;

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
    color: typeof value.color === 'string' && value.color ? value.color : projectColors[index % projectColors.length],
    created_at: createdAt,
    updated_at: typeof value.updated_at === 'string' && value.updated_at ? value.updated_at : createdAt,
    deleted_at: typeof value.deleted_at === 'string' ? value.deleted_at : null,
    sync_status: normalizeSyncStatus(value.sync_status),
  };
}

function normalizeType(value: unknown): IssueType {
  return issueTypes.includes(value as IssueType) ? (value as IssueType) : 'bug';
}

function normalizePriority(value: unknown): IssuePriority {
  return issuePriorities.includes(value as IssuePriority) ? (value as IssuePriority) : 'P2';
}

function normalizeStatus(value: unknown, isCompleted: boolean): IssueStatus {
  if (issueStatuses.includes(value as IssueStatus)) return value as IssueStatus;
  if (typeof value === 'string' && legacyStatusAliases[value]) return legacyStatusAliases[value];
  return isCompleted ? 'done' : 'open';
}

function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

export function normalizeIssueItem(value: StoredIssue, index = 0): IssueItem {
  const now = new Date().toISOString();
  const createdAt = typeof value.created_at === 'string' && value.created_at ? value.created_at : now;
  const id = normalizeId(value.id, 'issue', index + 1);
  const isCompleted = Boolean(value.is_completed);
  return {
    id,
    client_sync_id: typeof value.client_sync_id === 'string' ? value.client_sync_id : id,
    project_key: String(value.project_key || ''),
    number: typeof value.number === 'number' && Number.isFinite(value.number) ? value.number : null,
    type: normalizeType(value.type),
    priority: normalizePriority(value.priority),
    status: normalizeStatus(value.status, isCompleted),
    labels: normalizeLabels(value.labels),
    version: typeof value.version === 'string' && value.version ? value.version : null,
    title: String(value.title || ''),
    description: value.description ?? null,
    is_completed: isCompleted,
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
  // 规范化 + 写回只需要做一次（进程内），之后直接命中内存缓存，避免每次读取都跑 O(n) 的比对
  if (projectsHydrated) return getCachedList<IssueProject>(localKeys.issueProjects);
  const stored = await getCachedList<StoredProject>(localKeys.issueProjects);
  const normalized = stored.map(normalizeIssueProject);
  const changed = JSON.stringify(stored) !== JSON.stringify(normalized);
  if (changed) await setCachedList<IssueProject>(localKeys.issueProjects, normalized);
  projectsHydrated = true;
  return normalized;
}

async function readIssuesLocal() {
  if (issuesHydrated) return getCachedList<IssueItem>(localKeys.issues);
  const stored = await getCachedList<StoredIssue>(localKeys.issues);
  const normalized = stored.map(normalizeIssueItem);
  const withNumbers = assignMissingNumbers(normalized);
  const changed = JSON.stringify(stored) !== JSON.stringify(withNumbers);
  if (changed) await setCachedList<IssueItem>(localKeys.issues, withNumbers);
  issuesHydrated = true;
  return withNumbers;
}

/** 老数据没有编号：按创建时间顺序补齐，保证 ISS-001 这类编号稳定可见 */
function assignMissingNumbers(items: IssueItem[]) {
  const used = new Set(items.map((item) => item.number).filter((value): value is number => typeof value === 'number'));
  let next = items.reduce((max, item) => (typeof item.number === 'number' && item.number > max ? item.number : max), 0);
  const ordered = [...items].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  const assign = new Map<string, number>();
  for (const item of ordered) {
    if (typeof item.number === 'number') continue;
    next += 1;
    while (used.has(next)) next += 1;
    used.add(next);
    assign.set(item.id, next);
  }
  if (!assign.size) return items;
  return items.map((item) => (assign.has(item.id) ? { ...item, number: assign.get(item.id)! } : item));
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
    color: projectColors[projects.filter((project) => !project.deleted_at).length % projectColors.length],
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

export async function updateIssueProjectColorLocal(id: string, color: string) {
  const projects = await readIssueProjectsLocal();
  const now = new Date().toISOString();
  const next = projects.map((item) => (
    item.id === id ? { ...item, color, updated_at: now, sync_status: 'pending' as const } : item
  ));
  await setCachedList(localKeys.issueProjects, next);
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
  const issues = await readIssuesLocal();
  const now = new Date().toISOString();
  const id = createId('issue');
  const status: IssueStatus = normalizeStatus(payload.status, Boolean(payload.is_completed));
  const isCompleted = status === 'done' || Boolean(payload.is_completed);
  const maxNumber = issues.reduce((max, item) => (typeof item.number === 'number' && item.number > max ? item.number : max), 0);
  const item: IssueItem = {
    id,
    client_sync_id: id,
    project_key: projectKey,
    number: maxNumber + 1,
    type: normalizeType(payload.type),
    priority: normalizePriority(payload.priority),
    status: isCompleted ? 'done' : status,
    labels: normalizeLabels(payload.labels),
    version: typeof payload.version === 'string' && payload.version ? payload.version : null,
    title: String(payload.title || ''),
    is_completed: isCompleted,
    completed_at: payload.completed_at ?? (isCompleted ? now : null),
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

export async function updateIssueLocal(id: string, payload: Partial<IssueItem>): Promise<IssueItem | null> {
  const issues = await readIssuesLocal();
  let updated: IssueItem | null = null;
  const now = new Date().toISOString();
  const next = issues.map((item) => {
    if (item.id !== id) return item;
    const normalizedPayload: Partial<IssueItem> = { ...payload };
    if (payload.type !== undefined) normalizedPayload.type = normalizeType(payload.type);
    if (payload.priority !== undefined) normalizedPayload.priority = normalizePriority(payload.priority);
    if (payload.labels !== undefined) normalizedPayload.labels = normalizeLabels(payload.labels);
    if (payload.status !== undefined) {
      const status = normalizeStatus(payload.status, Boolean(payload.is_completed ?? item.is_completed));
      normalizedPayload.status = status;
      const completed = status === 'done';
      normalizedPayload.is_completed = completed;
      if (completed && !item.completed_at) normalizedPayload.completed_at = now;
      if (!completed) normalizedPayload.completed_at = null;
    }
    updated = { ...item, ...normalizedPayload, updated_at: now, sync_status: 'pending' };
    return updated;
  });
  await setCachedList(localKeys.issues, next);
  return updated;
}

/** 状态流转：完成会同步 is_completed / completed_at，撤销完成会清空完成时间 */
export async function updateIssueStatusLocal(id: string, status: IssueStatus) {
  const issues = await readIssuesLocal();
  const now = new Date().toISOString();
  const next = issues.map((item) => {
    if (item.id !== id) return item;
    const isCompleted = status === 'done';
    return {
      ...item,
      status,
      is_completed: isCompleted,
      completed_at: isCompleted ? (item.completed_at || now) : null,
      updated_at: now,
      sync_status: 'pending' as const,
    };
  });
  await setCachedList(localKeys.issues, next);
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
