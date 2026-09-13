import type { IssueEditForm, IssueItem } from './types';

export function emptyIssueForm(issue?: IssueItem | null): IssueEditForm {
  return {
    title: issue?.title || '',
    due_date: issue?.due_date || '',
    due_time: issue?.due_time || '',
    location: issue?.location || '',
    description: issue?.description || '',
  };
}

export function formatIssueDate(value?: string | null) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return year === String(new Date().getFullYear()) ? `${month}-${day}` : value;
}

export function sortIssues(items: IssueItem[]) {
  return [...items].sort((a, b) => {
    if (a.is_completed !== b.is_completed) return a.is_completed ? 1 : -1;

    if (a.is_completed) {
      const completedDiff = completionTimestamp(b) - completionTimestamp(a);
      if (completedDiff !== 0) return completedDiff;
    }

    if (a.due_date && b.due_date && a.due_date !== b.due_date) return a.due_date.localeCompare(b.due_date);
    if (Boolean(a.due_date) !== Boolean(b.due_date)) return a.due_date ? -1 : 1;
    return timestamp(b.created_at) - timestamp(a.created_at);
  });
}

function completionTimestamp(issue: IssueItem) {
  return timestamp(issue.completed_at) || timestamp(issue.updated_at) || timestamp(issue.created_at);
}

function timestamp(value?: string | null) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}
