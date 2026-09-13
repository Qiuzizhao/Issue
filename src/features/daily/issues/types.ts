export type SyncStatus = 'pending' | 'synced' | 'failed';

export type IssueProject = {
  id: string;
  key: string;
  name: string;
  created_at?: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  sync_status?: SyncStatus;
};

export type IssueItem = {
  id: string;
  project_key: string;
  title: string;
  description?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  location?: string | null;
  created_at?: string;
  updated_at?: string | null;
  client_sync_id?: string | null;
  deleted_at?: string | null;
  sync_status?: SyncStatus;
};

export type IssueEditForm = {
  title: string;
  due_date: string;
  due_time: string;
  location: string;
  description: string;
};
