import { Platform } from 'react-native';

/**
 * Console 设计语言（2026-09 v2）
 * 面向个人开发者的 issue 追踪：高密度列表 + 类型 / 优先级语义色 + 等宽数据字体。
 */
export const colors = {
  bg: '#F4F5F7',
  bgElevated: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceMuted: '#ECEEF2',
  surfaceSunken: '#E1E4EA',
  text: '#0F1218',
  textSoft: '#3A424F',
  muted: '#69717E',
  faint: '#9AA2AE',
  border: '#E2E5EA',
  borderStrong: '#D2D7DF',
  primary: '#3E63DD', // 默认主题色（可在设置里更换）
  primaryDark: '#2E4BC0',
  primarySoft: '#EDF1FD',
  brand: '#3E63DD',
  brandSoft: '#FFFFFF', // 顶栏改为纯白，不再使用浅蓝底
  danger: '#E5484D',
  dangerSoft: '#FDEFEF',
  success: '#0E9E8F',
  successSoft: '#E7F6F4',
  warning: '#DE8A0B',
  warningSoft: '#FDF3E2',
  tab: '#FFFFFF',
};

export type IssueTypeKey = 'bug' | 'chore' | 'docs' | 'ui';
export type IssuePriorityKey = 'P0' | 'P1' | 'P2' | 'P3';
export type IssueStatusKey = 'open' | 'in_progress' | 'done';

export const issueTypes: Record<IssueTypeKey, { label: string; color: string; soft: string; icon: string }> = {
  bug: { label: 'Bug', color: '#E5484D', soft: '#FDEFEF', icon: 'bug-outline' },
  chore: { label: '杂事', color: '#67707E', soft: '#EEEFF2', icon: 'build-outline' },
  docs: { label: '文档', color: '#3E63DD', soft: '#EDF1FD', icon: 'document-text-outline' },
  ui: { label: '界面', color: '#7048E8', soft: '#F1EDFE', icon: 'color-wand-outline' },
};

export const issuePriorities: Record<IssuePriorityKey, { color: string; soft: string }> = {
  P0: { color: '#E5484D', soft: '#FDEFEF' },
  P1: { color: '#DE8A0B', soft: '#FDF3E2' },
  P2: { color: '#67707E', soft: '#ECEEF2' },
  P3: { color: '#9AA2AE', soft: '#ECEEF2' },
};

export const issueStatuses: Record<IssueStatusKey, { label: string; color: string; soft: string }> = {
  open: { label: '待处理', color: '#69717E', soft: '#ECEEF2' },
  in_progress: { label: '进行中', color: '#3E63DD', soft: '#EDF1FD' },
  done: { label: '已完成', color: '#0E9E8F', soft: '#E7F6F4' },
};

/** 项目识别色：新建项目时按顺序分配 */
export const projectColors = ['#3E63DD', '#0E9E8F', '#E8590C', '#C2255C', '#7048E8', '#0B7285'];

export const typeface = {
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, monospace' }),
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 4,
  md: 6,
  lg: 10,
  xl: 12,
  xxl: 16,
  row: 12,
  sheet: 26,
  full: 9999,
};

export const shadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 12,
  elevation: 2,
};
