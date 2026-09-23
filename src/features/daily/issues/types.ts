export type SyncStatus = 'pending' | 'synced' | 'failed';

/** 历史类型仅用于兼容旧数据；当前记录统一为 bug。 */
export type IssueType = 'bug' | 'feature' | 'chore' | 'docs' | 'ui';

/** 优先级：P0 阻塞、P1 影响主流程、P2 普通、P3 有空再说 */
export type IssuePriority = 'P0' | 'P1' | 'P2' | 'P3';

/** 状态：open 待处理 / in_progress 进行中 / done 已完成 */
export type IssueStatus = 'open' | 'in_progress' | 'done';

/** 列表视图：列表 / 看板 */
export type IssueViewMode = 'list' | 'board';

export type IssueProject = {
  id: string;
  key: string;
  name: string;
  /** 项目识别色，新建项目时按色板顺序分配 */
  color?: string | null;
  created_at?: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  sync_status?: SyncStatus;
};

export type IssueItem = {
  id: string;
  project_key: string;
  /** 展示用编号，界面呈现为 ISS-128 */
  number?: number | null;
  type?: IssueType | null;
  priority?: IssuePriority | null;
  status?: IssueStatus | null;
  labels?: string[] | null;
  /** @deprecated 版本字段已下线，仅保留兼容读取 */
  version?: string | null;
  title: string;
  description?: string | null;
  is_completed: boolean;
  completed_at?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  /** @deprecated 关联文件已下线，仅保留兼容读取（历史字段名为 location） */
  location?: string | null;
  created_at?: string;
  updated_at?: string | null;
  client_sync_id?: string | null;
  deleted_at?: string | null;
  sync_status?: SyncStatus;
};

export type IssueEditForm = {
  title: string;
  priority: IssuePriority;
  status: IssueStatus;
  labels: string[];
  due_date: string;
  due_time: string;
  description: string;
};

export type IssueFilter = {
  query: string;
  projectKey: string | null;
  priority: IssuePriority | null;
  label: string | null;
};
