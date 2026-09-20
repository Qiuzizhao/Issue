import type { IssueEditForm, IssueFilter, IssueItem, IssuePriority, IssueStatus, IssueType } from './types';

export const issueTypeOptions: { key: IssueType; label: string }[] = [
  { key: 'bug', label: 'Bug' },
  { key: 'feature', label: '功能' },
  { key: 'chore', label: '杂事' },
  { key: 'docs', label: '文档' },
  { key: 'ui', label: '界面' },
];

export const issuePriorityOptions: IssuePriority[] = ['P0', 'P1', 'P2', 'P3'];

export const issueStatusOrder: IssueStatus[] = ['in_progress', 'open', 'done'];

const statusRank: Record<IssueStatus, number> = {
  in_progress: 0,
  open: 1,
  done: 2,
};

const priorityRank: Record<IssuePriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function emptyIssueForm(issue?: IssueItem | null): IssueEditForm {
  return {
    title: issue?.title || '',
    type: (issue?.type as IssueType) || 'bug',
    priority: (issue?.priority as IssuePriority) || 'P2',
    status: deriveStatus(issue),
    labels: Array.isArray(issue?.labels) ? issue!.labels!.slice() : [],
    due_date: issue?.due_date || '',
    due_time: issue?.due_time || '',
    description: issue?.description || '',
  };
}

export function formatIssueDate(value?: string | null) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return year === String(new Date().getFullYear()) ? `${month}-${day}` : value;
}

/** 列表里展示的编号：ISS-128 */
export function formatIssueCode(issue?: IssueItem | null) {
  const number = issue?.number;
  if (typeof number === 'number' && Number.isFinite(number)) {
    return `ISS-${String(number).padStart(3, '0')}`;
  }
  return 'ISS-—';
}

/** 相对时间：刚刚 / 2 小时前 / 昨天 / 3 天前 / 09-12 */
export function formatRelativeTime(value?: string | null) {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';
  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < 0) return '刚刚';
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return '昨天';
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  if (diff < 365 * day) return formatIssueDate(value.slice(0, 10));
  return value.slice(0, 10);
}

export function deriveStatus(issue?: IssueItem | null): IssueStatus {
  if (!issue) return 'open';
  if (issue.status) return issue.status;
  return issue.is_completed ? 'done' : 'open';
}

export function isClosed(status: IssueStatus) {
  return status === 'done';
}

export function countByStatus(items: IssueItem[]) {
  const counts: Record<IssueStatus, number> = { open: 0, in_progress: 0, done: 0 };
  for (const item of items) counts[deriveStatus(item)] += 1;
  return counts;
}

export type IssueGroup = { status: IssueStatus; title: string; items: IssueItem[] };

/** 按状态分组：进行中 → 待处理 → 已完成 */
export function groupIssuesByStatus(items: IssueItem[]): IssueGroup[] {
  const groups: IssueGroup[] = [];
  for (const status of issueStatusOrder) {
    const groupItems = items.filter((item) => deriveStatus(item) === status);
    if (groupItems.length) groups.push({ status, items: groupItems, title: statusTitle(status) });
  }
  return groups;
}

export function statusTitle(status: IssueStatus) {
  return { open: '待处理', in_progress: '进行中', done: '已完成' }[status];
}

export function allLabels(items: IssueItem[]) {
  const set = new Set<string>();
  for (const item of items) for (const label of item.labels || []) set.add(label);
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** 搜索：标题 / 编号 / 标签 / 描述 */
export function issueMatchesQuery(issue: IssueItem, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    issue.title,
    formatIssueCode(issue),
    String(issue.number ?? ''),
    (issue.labels || []).join(' '),
    issue.description || '',
    issue.type || '',
  ]
    .join(' ')
    .toLowerCase();
  return query.split(/\s+/).every((token) => haystack.includes(token));
}

export function filterIssues(items: IssueItem[], filter: IssueFilter) {
  return items.filter((item) => {
    // projectKey 为 null 表示全部项目，'' 表示收件箱（未归类）
    if (filter.projectKey !== null && item.project_key !== filter.projectKey) return false;
    if (filter.type && (item.type || 'bug') !== filter.type) return false;
    if (filter.priority && (item.priority || 'P2') !== filter.priority) return false;
    if (filter.label && !(item.labels || []).includes(filter.label)) return false;
    return issueMatchesQuery(item, filter.query);
  });
}

export function sortIssues(items: IssueItem[]) {
  return [...items].sort((a, b) => {
    const statusDiff = statusRank[deriveStatus(a)] - statusRank[deriveStatus(b)];
    if (statusDiff !== 0) return statusDiff;

    const priorityDiff = priorityRank[(a.priority as IssuePriority) || 'P2'] - priorityRank[(b.priority as IssuePriority) || 'P2'];
    if (priorityDiff !== 0) return priorityDiff;

    const updatedDiff = timestamp(b.updated_at || b.created_at) - timestamp(a.updated_at || a.created_at);
    if (updatedDiff !== 0) return updatedDiff;

    return timestamp(b.created_at) - timestamp(a.created_at);
  });
}

export function countOpenIssues(items: IssueItem[]) {
  return items.filter((item) => !isClosed(deriveStatus(item))).length;
}

function completionTimestamp(issue: IssueItem) {
  return timestamp(issue.completed_at) || timestamp(issue.updated_at) || timestamp(issue.created_at);
}

export function completionTimestampOf(issue: IssueItem) {
  return completionTimestamp(issue);
}

function timestamp(value?: string | null) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}
