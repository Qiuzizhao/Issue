import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { setAudioModeAsync, setIsAudioActiveAsync, useAudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, InteractionManager, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import {
  createIssueLocal,
  createIssueProjectLocal,
  deleteIssueLocal,
  deleteIssueProjectLocal,
  listIssueProjectsLocal,
  listIssuesLocal,
  reorderIssueProjectsLocal,
  updateIssueLocal,
  updateIssueProjectColorLocal,
  updateIssueProjectLocal,
  updateIssueStatusLocal,
} from '@/src/local/repositories/issuesRepository';
import { getSettingsLocal } from '@/src/local/settingsRepository';
import { FormSheet, Header, IconButton, Screen, SheetTextInput, StateView } from '@/src/shared/components';
import {
  colors,
  issuePriorities,
  issueStatuses,
  issueTypes,
  projectColors,
  typeface,
  useThemeColors,
} from '@/src/shared/theme';
import { runManualSync } from '@/src/sync/manualSync';
import type { SyncProgress } from '@/src/sync/syncProgress';
import { SwipeDeleteCard } from '../_shared/SwipeDeleteCard';
import { GroupHeader, IssueRow, TypeBadge } from './components/IssueBits';
import { styles } from './styles';
import { SyncProgressModal } from './SyncProgressModal';
import type {
  IssueEditForm,
  IssueFilter,
  IssueItem,
  IssueProject,
  IssueStatus,
  IssueType,
  IssueViewMode,
} from './types';
import {
  allLabels,
  countByStatus,
  countOpenIssues,
  deriveStatus,
  emptyIssueForm,
  filterIssues,
  formatIssueCode,
  formatRelativeTime,
  groupIssuesByStatus,
  issuePriorityOptions,
  issueTypeOptions,
  sortIssues,
  statusTitle,
} from './utils';

/** 收件箱：未归类到任何项目的 Issue */
const inboxKey = '';

type IssueScreenSnapshot = {
  projects: IssueProject[];
  issues: IssueItem[];
};

let cachedIssueScreenSnapshot: IssueScreenSnapshot | null = null;
let issueScreenPrewarmPromise: Promise<IssueScreenSnapshot> | null = null;

function projectNamesFromProjects(projects: IssueProject[]) {
  return Object.fromEntries(projects.map((project) => [project.key, project.name]));
}

function getCachedIssueScreenSnapshot() {
  return cachedIssueScreenSnapshot;
}

function setCachedIssueScreenSnapshot(snapshot: IssueScreenSnapshot) {
  cachedIssueScreenSnapshot = snapshot;
}

async function readIssueScreenSnapshot() {
  const [projects, issues] = await Promise.all([listIssueProjectsLocal(), listIssuesLocal()]);
  const snapshot = { projects, issues: sortIssues(issues) };
  setCachedIssueScreenSnapshot(snapshot);
  return snapshot;
}

export function prewarmIssueScreenData() {
  if (issueScreenPrewarmPromise) return issueScreenPrewarmPromise;
  issueScreenPrewarmPromise = readIssueScreenSnapshot().finally(() => {
    issueScreenPrewarmPromise = null;
  });
  return issueScreenPrewarmPromise;
}

/** 类型选择：五个彩色卡片（Bug / 功能 / 杂事 / 文档 / 界面） */
function TypePicker({ value, onChange }: { value: IssueType; onChange: (value: IssueType) => void }) {
  return (
    <View style={styles.typePicker}>
      {issueTypeOptions.map((option) => {
        const tone = issueTypes[option.key];
        const selected = value === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[
              styles.typeCard,
              selected && { backgroundColor: tone.soft, borderColor: tone.color },
            ]}
          >
            <Ionicons color={selected ? tone.color : colors.muted} name={tone.icon as never} size={15} />
            <Text style={[styles.typeCardText, selected && { color: tone.color, fontWeight: '700' }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type IssueListRowProps = {
  issue: IssueItem;
  projectName?: string;
  projectColor?: string;
  feedback: boolean;
  onOpen: (issue: IssueItem) => void;
  onToggle: (issue: IssueItem) => void;
  onDelete: (issue: IssueItem) => void;
  onStatusMenu: (issue: IssueItem) => void;
  onSwipeActiveChange: (active: boolean) => void;
};

/** 列表行：memo + 回调接收 issue 参数，保证行组件在父级重渲染时不被拖累 */
const IssueListRow = React.memo(function IssueListRow({
  issue,
  projectName,
  projectColor,
  feedback,
  onOpen,
  onToggle,
  onDelete,
  onStatusMenu,
  onSwipeActiveChange,
}: IssueListRowProps) {
  return (
    <View style={[styles.rowWrap, feedback && styles.rowFeedback]}>
      <SwipeDeleteCard
        onDelete={() => onDelete(issue)}
        onSwipeActiveChange={onSwipeActiveChange}
        secondaryAction={(close) => (
          <Pressable
            onPress={() => {
              close();
              onToggle(issue);
            }}
            style={styles.swipeCompleteAction}
          >
            <Ionicons color="#fff" name="checkmark" size={20} />
          </Pressable>
        )}
      >
        <IssueRow
          issue={issue}
          onLongPress={() => onStatusMenu(issue)}
          onPress={() => onOpen(issue)}
          onToggleComplete={() => onToggle(issue)}
          projectColor={projectColor}
          projectName={projectName}
        />
      </SwipeDeleteCard>
    </View>
  );
});

type BoardCardProps = {
  issue: IssueItem;
  projectName?: string;
  projectColor?: string;
  onOpen: (issue: IssueItem) => void;
  onStatusMenu: (issue: IssueItem) => void;
};

const BoardCard = React.memo(function BoardCard({
  issue,
  projectName,
  projectColor,
  onOpen,
  onStatusMenu,
}: BoardCardProps) {
  return (
    <Pressable onLongPress={() => onStatusMenu(issue)} delayLongPress={280} onPress={() => onOpen(issue)}>
      <IssueRow
        compact
        dense
        issue={issue}
        projectColor={projectColor}
        projectName={projectName}
      />
    </Pressable>
  );
});

export function IssueScreen() {
  const themeColors = useThemeColors();
  const completeSoundPlayer = useAudioPlayer(require('../../../../assets/sounds/todo-complete-ding.wav'), {
    downloadFirst: true,
    keepAudioSessionActive: true,
  });
  const initialSnapshot = getCachedIssueScreenSnapshot();

  const [projects, setProjects] = useState<IssueProject[]>(() => initialSnapshot?.projects ?? []);
  const [issues, setIssues] = useState<IssueItem[]>(() => initialSnapshot?.issues ?? []);
  const [view, setView] = useState<IssueViewMode>('list');
  /** 搜索词单独存一份：输入即时回显，过滤走 useDeferredValue，避免每次按键都重算整表 */
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<IssueFilter>({
    query: '',
    projectKey: null,
    type: null,
    priority: null,
    label: null,
  });
  const deferredQuery = useDeferredValue(query);
  const [editingIssue, setEditingIssue] = useState<IssueItem | null>(null);
  const [editForm, setEditForm] = useState<IssueEditForm>(() => emptyIssueForm(null));
  const [createForm, setCreateForm] = useState<IssueEditForm>(() => emptyIssueForm(null));
  const [pendingProjectKey, setPendingProjectKey] = useState<string>(inboxKey);
  const [projectNames, setProjectNames] = useState<Record<string, string>>(() => projectNamesFromProjects(initialSnapshot?.projects ?? []));
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(Boolean(initialSnapshot));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncCompleted, setSyncCompleted] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | undefined>(undefined);
  const [showSyncProgress, setShowSyncProgress] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackIssueIds, setFeedbackIssueIds] = useState<string[]>([]);
  const detailSheetRef = useRef<BottomSheetModal>(null);
  const createSheetRef = useRef<BottomSheetModal>(null);
  const projectSheetRef = useRef<BottomSheetModal>(null);
  const filterSheetRef = useRef<BottomSheetModal>(null);
  const completionFeedbackTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await readIssueScreenSnapshot();
      setProjects(snapshot.projects);
      setIssues(snapshot.issues);
      setProjectNames(projectNamesFromProjects(snapshot.projects));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Issue 失败');
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      void loadData();
    });
    return () => task.cancel();
  }, [loadData]);

  useEffect(() => {
    void Promise.all([
      setAudioModeAsync({
        interruptionMode: 'mixWithOthers',
        playsInSilentMode: true,
      }),
      setIsAudioActiveAsync(true),
    ]).catch(() => undefined);
  }, []);

  useEffect(() => {
    completeSoundPlayer.muted = false;
    completeSoundPlayer.volume = 0.42;
  }, [completeSoundPlayer]);


  useEffect(() => () => {
    Object.values(completionFeedbackTimersRef.current).forEach(clearTimeout);
  }, []);

  const projectByKey = useMemo(
    () => new Map(projects.map((project) => [project.key, project])),
    [projects],
  );
  const filteredIssues = useMemo(
    () => sortIssues(filterIssues(issues, { ...filter, query: deferredQuery })),
    [deferredQuery, filter, issues],
  );
  const statusGroups = useMemo(() => groupIssuesByStatus(filteredIssues), [filteredIssues]);
  /** 扁平化成「分组标题 + 行」的列表，间距完全由单元格自己控制，保证与改造前像素级一致 */
  const listRows = useMemo(() => {
    const rows: (
      | { key: string; kind: 'group'; status: IssueStatus; count: number }
      | { key: string; kind: 'issue'; issue: IssueItem }
    )[] = [];
    for (const group of statusGroups) {
      rows.push({ key: `group-${group.status}`, kind: 'group', status: group.status, count: group.items.length });
      for (const issue of group.items) rows.push({ key: issue.id, kind: 'issue', issue });
    }
    return rows;
  }, [statusGroups]);
  const counts = useMemo(() => countByStatus(issues), [issues]);
  const inboxIssues = useMemo(() => issues.filter((issue) => issue.project_key === inboxKey), [issues]);
  const labelOptions = useMemo(() => allLabels(issues), [issues]);
  const activeFilterCount =
    (filter.type ? 1 : 0) + (filter.priority ? 1 : 0) + (filter.label ? 1 : 0);

  const headerSubtitle = `${counts.open} 待处理 · ${counts.in_progress} 进行中 · ${counts.done} 已完成`;

  const playCompleteSound = useCallback(() => {
    completeSoundPlayer.muted = false;
    completeSoundPlayer.volume = 0.42;
    void completeSoundPlayer.seekTo(0).then(() => completeSoundPlayer.play()).catch(() => completeSoundPlayer.play());
  }, [completeSoundPlayer]);

  const handleManualSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncProgress(null);
    setSyncCompleted(false);
    setSyncSummary(undefined);
    setShowSyncProgress(true);
    try {
      const result = await runManualSync({ onProgress: setSyncProgress });
      if (result.status === 'signedOut') {
        setShowSyncProgress(false);
        Alert.alert('需要登录', '请先登录账号后再同步 Issue 数据。', [
          { text: '去登录', onPress: () => router.push('/auth' as never) },
          { text: '取消', style: 'cancel' },
        ]);
        return;
      }
      await loadData();
      setSyncSummary(`已同步 ${result.uploadedProjects + result.uploadedIssues} 项 · 下载 ${result.downloadedProjects + result.downloadedIssues} 项`);
      setSyncCompleted(true);
      await new Promise((resolve) => setTimeout(resolve, 700));
      setShowSyncProgress(false);
      Alert.alert('同步完成', `上传 ${result.uploadedProjects + result.uploadedIssues} 项，下载 ${result.downloadedProjects + result.downloadedIssues} 项。`);
    } catch (err) {
      setShowSyncProgress(false);
      Alert.alert('同步失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setSyncing(false);
    }
  }, [loadData, syncing]);

  /** 局部更新内存里的单条 Issue，避免每次操作都重读整个存储 */
  const patchIssueLocally = useCallback((id: string, patch: Partial<IssueItem>) => {
    setIssues((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
      setCachedIssueScreenSnapshot({ projects, issues: next });
      return next;
    });
  }, [projects]);

  const setIssueStatus = useCallback((issue: IssueItem, status: IssueStatus) => {
    const now = new Date().toISOString();
    const completed = status === 'done';
    patchIssueLocally(issue.id, {
      status,
      is_completed: completed,
      completed_at: completed ? (issue.completed_at || now) : null,
      updated_at: now,
    });
    if (completed) {
      playCompleteSound();
      setFeedbackIssueIds((current) => (current.includes(issue.id) ? current : [...current, issue.id]));
      if (completionFeedbackTimersRef.current[issue.id]) clearTimeout(completionFeedbackTimersRef.current[issue.id]);
      completionFeedbackTimersRef.current[issue.id] = setTimeout(() => {
        setFeedbackIssueIds((current) => current.filter((id) => id !== issue.id));
        delete completionFeedbackTimersRef.current[issue.id];
      }, 1400);
    }
    void updateIssueStatusLocal(issue.id, status).catch((err) => {
      Alert.alert('更新失败', err instanceof Error ? err.message : '请稍后重试');
      void loadData();
    });
  }, [loadData, patchIssueLocally, playCompleteSound]);

  const toggleIssueCompleted = useCallback((issue: IssueItem) => {
    const current = deriveStatus(issue);
    void setIssueStatus(issue, current === 'done' ? 'open' : 'done');
  }, [setIssueStatus]);

  const promptIssueStatus = useCallback((issue: IssueItem) => {
    Alert.alert(formatIssueCode(issue), issue.title, [
      { text: '待处理', onPress: () => void setIssueStatus(issue, 'open') },
      { text: '进行中', onPress: () => void setIssueStatus(issue, 'in_progress') },
      { text: '已完成', onPress: () => void setIssueStatus(issue, 'done') },
      { text: '取消', style: 'cancel' },
    ]);
  }, [setIssueStatus]);

  const openIssueDetail = useCallback((issue: IssueItem) => {
    setEditingIssue(issue);
    setEditForm(emptyIssueForm(issue));
    detailSheetRef.current?.present();
  }, []);

  const closeIssueDetail = useCallback(() => {
    detailSheetRef.current?.dismiss();
    setEditingIssue(null);
  }, []);

  const openCreateSheet = useCallback(async (projectKey?: string) => {
    const settings = await getSettingsLocal().catch(() => null);
    const defaultType = (settings?.default_issue_type as IssueType) || 'bug';
    const fallbackProject = projectKey
      ?? (settings?.inbox_first
        ? inboxKey
        : (settings?.default_project_key && projectByKey.has(settings.default_project_key)
          ? settings.default_project_key
          : (filter.projectKey !== null && filter.projectKey !== inboxKey
            ? filter.projectKey
            : (projects[0]?.key ?? inboxKey))));
    setCreateForm({
      ...emptyIssueForm(null),
      type: defaultType,
      priority: 'P2',
    });
    setPendingProjectKey(fallbackProject);
    createSheetRef.current?.present();
  }, [filter.projectKey, projectByKey, projects]);

  const submitCreateIssue = async (options?: { toInbox?: boolean }) => {
    const title = createForm.title.trim();
    if (!title) {
      Alert.alert('缺少标题', '请先写下这个 Issue 要解决什么。');
      return;
    }
    const projectKey = options?.toInbox ? inboxKey : pendingProjectKey;
    setSaving(true);
    try {
      const created = await createIssueLocal({
        project_key: projectKey,
        title,
        type: createForm.type,
        priority: createForm.priority,
        status: 'open',
        labels: createForm.labels,
        description: createForm.description || null,
      });
      setIssues((current) => {
        const next = sortIssues([created, ...current]);
        setCachedIssueScreenSnapshot({ projects, issues: next });
        return next;
      });
      setCreateForm(emptyIssueForm(null));
      createSheetRef.current?.dismiss();
    } catch (err) {
      Alert.alert('创建失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const saveIssueDetail = async () => {
    if (!editingIssue) return;
    const title = editForm.title.trim();
    if (!title) {
      Alert.alert('缺少标题', '请填写 Issue 标题。');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateIssueLocal(editingIssue.id, {
        title,
        type: editForm.type,
        priority: editForm.priority,
        labels: editForm.labels,
        description: editForm.description || null,
        status: editForm.status,
      });
      if (updated) patchIssueLocally(updated.id, updated);
      if (editForm.status === 'done' && deriveStatus(editingIssue) !== 'done') playCompleteSound();
      closeIssueDetail();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const removeIssue = useCallback((issue: IssueItem, onDeleted?: () => void) => {
    Alert.alert('删除确认', `确定删除「${formatIssueCode(issue)} ${issue.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteIssueLocal(issue.id);
          onDeleted?.();
          setIssues((current) => {
            const next = current.filter((item) => item.id !== issue.id);
            setCachedIssueScreenSnapshot({ projects, issues: next });
            return next;
          });
        },
      },
    ]);
  }, [projects]);

  const addProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    try {
      const created = await createIssueProjectLocal(name);
      setNewProjectName('');
      await loadData();
      setFilter((current) => ({ ...current, projectKey: created.key }));
    } catch (err) {
      Alert.alert('新增项目失败', err instanceof Error ? err.message : '请稍后重试');
    }
  };

  const saveProjectName = async (project: IssueProject) => {
    const name = (projectNames[project.key] || '').trim();
    if (!name) return;
    try {
      await updateIssueProjectLocal(project.id, name);
      await loadData();
    } catch (err) {
      Alert.alert('保存项目失败', err instanceof Error ? err.message : '请稍后重试');
    }
  };

  const cycleProjectColor = async (project: IssueProject) => {
    const current = project.color || projectColors[0];
    const index = Math.max(0, projectColors.indexOf(current));
    const nextColor = projectColors[(index + 1) % projectColors.length];
    try {
      await updateIssueProjectColorLocal(project.id, nextColor);
      await loadData();
    } catch (err) {
      Alert.alert('设置项目色失败', err instanceof Error ? err.message : '请稍后重试');
    }
  };

  const removeProject = (project: IssueProject) => {
    Alert.alert('删除项目', `删除「${project.name}」将同时删除其中的 Issue，确定继续吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteIssueProjectLocal(project);
          await loadData();
        },
      },
    ]);
  };

  const moveProject = async (index: number, direction: -1 | 1) => {
    if (index + direction < 0 || index + direction >= projects.length) return;
    const nextProjects = [...projects];
    const temp = nextProjects[index];
    nextProjects[index] = nextProjects[index + direction];
    nextProjects[index + direction] = temp;
    setProjects(nextProjects);
    setCachedIssueScreenSnapshot({ projects: nextProjects, issues });
    try {
      await reorderIssueProjectsLocal(nextProjects.map((project) => project.key));
    } catch (err) {
      Alert.alert('调整顺序失败', err instanceof Error ? err.message : '请稍后重试');
      await loadData();
    }
  };

  const handleSwipeActiveChange = useCallback((active: boolean) => setScrollEnabled(!active), []);

  const renderListRow = useCallback(({ item }: { item: (typeof listRows)[number] }) => {
    if (item.kind === 'group') {
      return (
        <View style={styles.groupRow}>
          <GroupHeader
            count={item.count}
            title={statusTitle(item.status)}
            tone={issueStatuses[item.status].color}
          />
        </View>
      );
    }
    const project = projectByKey.get(item.issue.project_key);
    return (
      <IssueListRow
        feedback={feedbackIssueIds.includes(item.issue.id)}
        issue={item.issue}
        onDelete={removeIssue}
        onOpen={openIssueDetail}
        onStatusMenu={promptIssueStatus}
        onSwipeActiveChange={handleSwipeActiveChange}
        onToggle={toggleIssueCompleted}
        projectColor={project?.color || colors.faint}
        projectName={project?.name}
      />
    );
  }, [feedbackIssueIds, handleSwipeActiveChange, openIssueDetail, projectByKey, promptIssueStatus, removeIssue, toggleIssueCompleted]);

  const renderListEmpty = () => {
    if (!hydrated || error) return null;
    return (
      <View style={styles.emptyState}>
        <Ionicons color={colors.faint} name="file-tray-outline" size={26} />
        <Text style={styles.emptyTitle}>{query || activeFilterCount ? '没有匹配的 Issue' : '还没有 Issue'}</Text>
        <Text style={styles.emptyText}>
          {query || activeFilterCount ? '换个关键词，或者清空筛选条件' : '先记下第一个问题，之后可以归类到项目'}
        </Text>
      </View>
    );
  };

  const renderBoardView = () => {
    if (!hydrated || error) return null;
    const columns: IssueStatus[] = ['open', 'in_progress', 'done'];
    return (
      <ScrollView
        contentContainerStyle={styles.boardRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {columns.map((status) => {
          const items = filteredIssues.filter((issue) => deriveStatus(issue) === status);
          return (
            <View key={status} style={styles.boardColumn}>
              <GroupHeader count={items.length} title={statusTitle(status)} tone={issueStatuses[status].color} />
              {items.length ? items.map((issue) => (
                <BoardCard
                  key={issue.id}
                  issue={issue}
                  onOpen={openIssueDetail}
                  onStatusMenu={promptIssueStatus}
                  projectColor={projectByKey.get(issue.project_key)?.color || colors.faint}
                  projectName={projectByKey.get(issue.project_key)?.name}
                />
              )) : (
                <View style={styles.boardColumnEmpty}>
                  <Text style={styles.boardColumnEmptyText}>长按卡片可切换状态</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  const projectChips = useMemo(() => {
    const chips: { key: string | null; name: string; color?: string; count: number }[] = [
      { key: null, name: '全部', count: countOpenIssues(issues) },
    ];
    if (inboxIssues.length) {
      chips.push({ key: inboxKey, name: '收件箱', color: colors.faint, count: countOpenIssues(inboxIssues) });
    }
    for (const project of projects) {
      const projectIssues = issues.filter((issue) => issue.project_key === project.key);
      chips.push({ key: project.key, name: project.name, color: project.color || colors.faint, count: countOpenIssues(projectIssues) });
    }
    return chips;
  }, [inboxIssues, issues, projects]);

  /** 列表 / 看板共用的头部（搜索、视图切换、项目筛选） */
  const renderListHeader = useCallback(() => (
    <>
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons color={colors.faint} name="search-outline" size={15} />
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setQuery}
            placeholder="搜索标题 / ISS-128 / 标签"
            placeholderTextColor={colors.faint}
            style={styles.searchInput}
            value={query}
          />
          {query ? (
            <Pressable hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons color={colors.faint} name="close-circle" size={16} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => filterSheetRef.current?.present()}
          style={[styles.filterButton, activeFilterCount ? styles.filterButtonActive : null]}
        >
          <Ionicons
            color={activeFilterCount ? colors.primaryDark : colors.textSoft}
            name="options-outline"
            size={17}
          />
          {activeFilterCount ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.viewSwitch}>
        {([
          { key: 'list', label: '列表', icon: 'list-outline' },
          { key: 'board', label: '看板', icon: 'albums-outline' },
        ] as { key: IssueViewMode; label: string; icon: string }[]).map((option) => {
          const active = view === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setView(option.key)}
              style={[styles.viewSwitchItem, active && styles.viewSwitchItemActive]}
            >
              <Ionicons color={active ? colors.text : colors.muted} name={option.icon as never} size={16} />
              <Text style={[styles.viewSwitchText, active && styles.viewSwitchTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.chipsRow} horizontal showsHorizontalScrollIndicator={false}>
        {projectChips.map((chip) => {
          const selected = filter.projectKey === chip.key;
          return (
            <Pressable
              key={chip.key ?? 'all'}
              onPress={() => setFilter((current) => ({ ...current, projectKey: chip.key }))}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              {chip.color ? <View style={[styles.chipDot, { backgroundColor: chip.color }]} /> : null}
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{chip.name}</Text>
              <Text style={[styles.chipCount, selected && styles.chipCountSelected]}>{chip.count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <StateView error={error} loading={loading && !hydrated} onRetry={loadData} />
    </>
  ), [activeFilterCount, error, filter.projectKey, hydrated, loadData, loading, projectChips, query, view]);

  return (
    <Screen>
      <Header
        action={<IconButton name="settings-outline" label="设置" transparent onPress={() => router.push('/settings' as never)} />}
        align="left"
        rightAction={(
          <View style={styles.headerActions}>
            <Pressable
              accessibilityLabel="编辑项目"
              onPress={() => projectSheetRef.current?.present()}
              style={styles.filterButton}
            >
              <Ionicons color={colors.textSoft} name="folder-outline" size={17} />
            </Pressable>
            <IconButton
              name={syncing ? 'hourglass-outline' : 'sync-outline'}
              label="同步"
              transparent
              color={themeColors.primary}
              onPress={() => void handleManualSync()}
            />
          </View>
        )}
        size="large"
        subtitle={headerSubtitle}
        title="Issue"
      />
      <View style={{ flex: 1 }}>
        {view === 'list' ? (
          <FlatList
            contentContainerStyle={styles.listContent}
            data={listRows}
            initialNumToRender={8}
            keyboardShouldPersistTaps="handled"
            keyExtractor={(item: (typeof listRows)[number]) => item.key}
            ListEmptyComponent={renderListEmpty}
            ListHeaderComponent={<View style={styles.headerBlock}>{renderListHeader()}</View>}
            maxToRenderPerBatch={8}
            removeClippedSubviews={Platform.OS === 'android'}
            renderItem={renderListRow}
            scrollEnabled={scrollEnabled}
            showsVerticalScrollIndicator={false}
            style={styles.noScrollBounce}
            updateCellsBatchingPeriod={50}
            windowSize={7}
          />
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={scrollEnabled}
            showsVerticalScrollIndicator={false}
            style={styles.noScrollBounce}
          >
            {renderListHeader()}
            {renderBoardView()}
          </ScrollView>
        )}

        <Pressable accessibilityLabel="新建 Issue" onPress={() => void openCreateSheet()} style={styles.fab}>
          <Ionicons color="#fff" name="add" size={26} />
        </Pressable>
      </View>

      {/* 详情 / 编辑 */}
      <FormSheet bottomSheetRef={detailSheetRef} contentStyle={styles.sheetContent} lockHeight snapPoints={['90%']}>
        <View style={styles.sheetHead}>
          <TypeBadge type={editForm.type} />
          <Text style={styles.sheetCode}>{editingIssue ? formatIssueCode(editingIssue) : ''}</Text>
          <View style={{ flex: 1 }} />
          <Pressable hitSlop={8} onPress={closeIssueDetail}>
            <Ionicons color={colors.faint} name="close" size={20} />
          </Pressable>
        </View>
        <Text style={styles.sheetTitle}>编辑 Issue</Text>

        <View>
          <Text style={styles.fieldLabel}>类型</Text>
          <TypePicker value={editForm.type} onChange={(type) => setEditForm((current) => ({ ...current, type }))} />
        </View>

        <View>
          <Text style={styles.fieldLabel}>标题</Text>
          <SheetTextInput
            onChangeText={(title) => setEditForm((current) => ({ ...current, title }))}
            placeholder="这个 Issue 要解决什么"
            placeholderTextColor={colors.faint}
            style={styles.input}
            value={editForm.title}
          />
        </View>

        <View>
          <Text style={styles.fieldLabel}>项目</Text>
          <View style={styles.pickRow}>
            {[{ key: inboxKey, name: '收件箱', color: colors.faint }, ...projects.map((project) => ({ key: project.key, name: project.name, color: project.color || colors.faint }))].map((item) => {
              const selected = (editingIssue?.project_key ?? inboxKey) === item.key;
              return (
                <Pressable
                  key={item.key || 'inbox'}
                  onPress={() => {
                    if (!editingIssue) return;
                    setEditingIssue({ ...editingIssue, project_key: item.key });
                  }}
                  style={[styles.pickChip, selected && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                >
                  <View style={[styles.chipDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.pickChipText, selected && { color: colors.primaryDark }]}>{item.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>优先级</Text>
          <View style={styles.pickRow}>
            {issuePriorityOptions.map((priority) => {
              const tone = issuePriorities[priority];
              const selected = editForm.priority === priority;
              return (
                <Pressable
                  key={priority}
                  onPress={() => setEditForm((current) => ({ ...current, priority }))}
                  style={[styles.pickChip, selected && { backgroundColor: tone.soft, borderColor: tone.color }]}
                >
                  <Text style={[styles.pickChipText, selected && { color: tone.color, fontFamily: typeface.mono }]}>{priority}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>状态</Text>
          <View style={styles.pickRow}>
            {(['open', 'in_progress', 'done'] as IssueStatus[]).map((status) => {
              const tone = issueStatuses[status];
              const selected = editForm.status === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => setEditForm((current) => ({ ...current, status }))}
                  style={[styles.pickChip, selected && { backgroundColor: tone.soft, borderColor: tone.color }]}
                >
                  <Text style={[styles.pickChipText, selected && { color: tone.color }]}>{tone.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>标签</Text>
          <SheetTextInput
            autoCapitalize="none"
            onChangeText={(text) => setEditForm((current) => ({
              ...current,
              labels: text.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean),
            }))}
            placeholder="ios, native, sync"
            placeholderTextColor={colors.faint}
            style={[styles.input, styles.monoInput]}
            value={(editForm.labels || []).join(', ')}
          />
        </View>

        <View>
          <Text style={styles.fieldLabel}>描述</Text>
          <SheetTextInput
            multiline
            onChangeText={(description) => setEditForm((current) => ({ ...current, description }))}
            placeholder="复现步骤 / 期望结果 / 报错栈…"
            placeholderTextColor={colors.faint}
            style={[styles.input, styles.textArea]}
            value={editForm.description}
          />
        </View>

        {editingIssue ? (
          <View>
            <Text style={styles.fieldLabel}>时间线</Text>
            <View style={styles.timeline}>
              <View style={styles.timelineRow}>
                <View style={[styles.timelineDot, { backgroundColor: colors.primary }]} />
                <View>
                  <Text style={styles.timelineText}>创建</Text>
                  <Text style={styles.timelineTime}>{formatRelativeTime(editingIssue.created_at)}</Text>
                </View>
              </View>
              <View style={styles.timelineRow}>
                <View style={[styles.timelineDot, { backgroundColor: colors.surfaceSunken }]} />
                <View>
                  <Text style={styles.timelineText}>最近更新</Text>
                  <Text style={styles.timelineTime}>{formatRelativeTime(editingIssue.updated_at || editingIssue.created_at)}</Text>
                </View>
              </View>
              {editingIssue.completed_at ? (
                <View style={styles.timelineRow}>
                  <View style={[styles.timelineDot, { backgroundColor: colors.success }]} />
                  <View>
                    <Text style={styles.timelineText}>已完成</Text>
                    <Text style={styles.timelineTime}>{formatRelativeTime(editingIssue.completed_at)}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={styles.sheetActions}>
          {editingIssue ? (
            <Pressable
              onPress={() => removeIssue(editingIssue, closeIssueDetail)}
              style={[styles.actionButton, styles.actionDanger]}
            >
              <Ionicons color={colors.danger} name="trash-outline" size={17} />
              <Text style={[styles.actionText, styles.actionTextDanger]}>删除</Text>
            </Pressable>
          ) : null}
          <Pressable
            disabled={saving}
            onPress={() => void saveIssueDetail()}
            style={[styles.actionButton, styles.actionPrimary, saving && { opacity: 0.6 }]}
          >
            <Ionicons color="#fff" name="checkmark" size={17} />
            <Text style={[styles.actionText, styles.actionTextLight]}>保存</Text>
          </Pressable>
        </View>
      </FormSheet>

      {/* 新建 Issue */}
      <FormSheet bottomSheetRef={createSheetRef} contentStyle={styles.sheetContent}>
        <View style={styles.lineHeaderRow}>
          <Text style={styles.sheetTitle}>新建 Issue</Text>
          <Pressable hitSlop={8} onPress={() => createSheetRef.current?.dismiss()}>
            <Ionicons color={colors.faint} name="close" size={20} />
          </Pressable>
        </View>

        <View>
          <Text style={styles.fieldLabel}>类型</Text>
          <TypePicker value={createForm.type} onChange={(type) => setCreateForm((current) => ({ ...current, type }))} />
        </View>

        <View>
          <Text style={styles.fieldLabel}>标题</Text>
          <SheetTextInput
            autoFocus
            onChangeText={(title) => setCreateForm((current) => ({ ...current, title }))}
            placeholder="写下要解决的问题或要做的功能"
            placeholderTextColor={colors.faint}
            style={styles.input}
            value={createForm.title}
          />
        </View>

        <View>
          <Text style={styles.fieldLabel}>项目</Text>
          <View style={styles.pickRow}>
            {[{ key: inboxKey, name: '收件箱', color: colors.faint }, ...projects.map((project) => ({ key: project.key, name: project.name, color: project.color || colors.faint }))].map((item) => {
              const selected = pendingProjectKey === item.key;
              return (
                <Pressable
                  key={item.key || 'inbox'}
                  onPress={() => setPendingProjectKey(item.key)}
                  style={[styles.pickChip, selected && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                >
                  <View style={[styles.chipDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.pickChipText, selected && { color: colors.primaryDark }]}>{item.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>优先级</Text>
          <View style={styles.pickRow}>
            {issuePriorityOptions.map((priority) => {
              const tone = issuePriorities[priority];
              const selected = createForm.priority === priority;
              return (
                <Pressable
                  key={priority}
                  onPress={() => setCreateForm((current) => ({ ...current, priority }))}
                  style={[styles.pickChip, selected && { backgroundColor: tone.soft, borderColor: tone.color }]}
                >
                  <Text style={[styles.pickChipText, selected && { color: tone.color, fontFamily: typeface.mono }]}>{priority}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>标签</Text>
          <SheetTextInput
            autoCapitalize="none"
            onChangeText={(text) => setCreateForm((current) => ({
              ...current,
              labels: text.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean),
            }))}
            placeholder="ios, sync"
            placeholderTextColor={colors.faint}
            style={[styles.input, styles.monoInput]}
            value={(createForm.labels || []).join(', ')}
          />
        </View>

        <View>
          <Text style={styles.fieldLabel}>描述</Text>
          <SheetTextInput
            multiline
            onChangeText={(description) => setCreateForm((current) => ({ ...current, description }))}
            placeholder="复现步骤 / 期望结果（可留空）"
            placeholderTextColor={colors.faint}
            style={[styles.input, styles.textArea]}
            value={createForm.description}
          />
        </View>

        <View style={styles.sheetActions}>
          <Pressable
            disabled={saving}
            onPress={() => void submitCreateIssue({ toInbox: true })}
            style={[styles.actionButton, saving && { opacity: 0.6 }]}
          >
            <Ionicons color={colors.textSoft} name="file-tray-outline" size={17} />
            <Text style={styles.actionText}>存到收件箱</Text>
          </Pressable>
          <Pressable
            disabled={saving}
            onPress={() => void submitCreateIssue()}
            style={[styles.actionButton, styles.actionPrimary, saving && { opacity: 0.6 }]}
          >
            <Ionicons color="#fff" name="add" size={18} />
            <Text style={[styles.actionText, styles.actionTextLight]}>创建</Text>
          </Pressable>
        </View>
      </FormSheet>

      {/* 筛选 */}
      <FormSheet bottomSheetRef={filterSheetRef} contentStyle={styles.sheetContent}>
        <View style={styles.lineHeaderRow}>
          <Text style={styles.sheetTitle}>筛选</Text>
          <Pressable
            onPress={() => setFilter((current) => ({ ...current, type: null, priority: null, label: null }))}
          >
            <Text style={{ color: colors.primaryDark, fontSize: 13, fontWeight: '600' }}>重置</Text>
          </Pressable>
        </View>

        <View>
          <Text style={styles.fieldLabel}>类型</Text>
          <View style={styles.pickRow}>
            {issueTypeOptions.map((option) => {
              const tone = issueTypes[option.key];
              const selected = filter.type === option.key;
              const count = issues.filter((issue) => (issue.type || 'bug') === option.key).length;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setFilter((current) => ({ ...current, type: selected ? null : option.key }))}
                  style={[styles.pickChip, selected && { backgroundColor: tone.soft, borderColor: tone.color }]}
                >
                  <Ionicons color={selected ? tone.color : colors.muted} name={tone.icon as never} size={13} />
                  <Text style={[styles.pickChipText, selected && { color: tone.color }]}>{option.label}</Text>
                  <Text style={styles.chipCount}>{count}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.fieldLabel}>优先级</Text>
          <View style={styles.pickRow}>
            {issuePriorityOptions.map((priority) => {
              const tone = issuePriorities[priority];
              const selected = filter.priority === priority;
              const count = issues.filter((issue) => (issue.priority || 'P2') === priority).length;
              return (
                <Pressable
                  key={priority}
                  onPress={() => setFilter((current) => ({ ...current, priority: selected ? null : priority }))}
                  style={[styles.pickChip, selected && { backgroundColor: tone.soft, borderColor: tone.color }]}
                >
                  <Text style={[styles.pickChipText, { fontFamily: typeface.mono }, selected && { color: tone.color }]}>{priority}</Text>
                  <Text style={styles.chipCount}>{count}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {labelOptions.length ? (
          <View>
            <Text style={styles.fieldLabel}>标签</Text>
            <View style={styles.pickRow}>
              {labelOptions.map((label) => {
                const selected = filter.label === label;
                return (
                  <Pressable
                    key={label}
                    onPress={() => setFilter((current) => ({ ...current, label: selected ? null : label }))}
                    style={[styles.pickChip, selected && { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}
                  >
                    <Text style={[styles.pickChipText, selected && { color: colors.primaryDark }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={() => filterSheetRef.current?.dismiss()}
          style={[styles.actionButton, styles.actionPrimary]}
        >
          <Text style={[styles.actionText, styles.actionTextLight]}>应用 · {filteredIssues.length} 条</Text>
        </Pressable>
      </FormSheet>

      {/* 编辑项目 */}
      <FormSheet bottomSheetRef={projectSheetRef} contentStyle={styles.sheetContent}>
        <Text style={styles.sheetTitle}>编辑项目</Text>
        <Text style={styles.emptyText}>点击左侧色点可切换项目识别色，项目色会出现在列表与看板里</Text>
        {projects.map((project, index) => (
          <View key={project.key} style={styles.projectRow}>
            <Pressable
              accessibilityLabel="切换项目颜色"
              onPress={() => void cycleProjectColor(project)}
              style={[styles.chipDot, { backgroundColor: project.color || colors.faint, height: 14, width: 14 }]}
            />
            <SheetTextInput
              onChangeText={(value) => setProjectNames((current) => ({ ...current, [project.key]: value }))}
              placeholder="项目名称"
              placeholderTextColor={colors.faint}
              style={styles.projectInput}
              value={projectNames[project.key] || ''}
            />
            <Text style={styles.chipCount}>
              {countOpenIssues(issues.filter((issue) => issue.project_key === project.key))}
            </Text>
            <Pressable disabled={index === 0} onPress={() => moveProject(index, -1)} style={[styles.projectAction, index === 0 && { opacity: 0.3 }]}>
              <Ionicons color={colors.textSoft} name="chevron-up" size={18} />
            </Pressable>
            <Pressable disabled={index === projects.length - 1} onPress={() => moveProject(index, 1)} style={[styles.projectAction, index === projects.length - 1 && { opacity: 0.3 }]}>
              <Ionicons color={colors.textSoft} name="chevron-down" size={18} />
            </Pressable>
            <Pressable onPress={() => void saveProjectName(project)} style={styles.projectAction}>
              <Ionicons color={themeColors.primary} name="checkmark" size={18} />
            </Pressable>
            <Pressable onPress={() => removeProject(project)} style={[styles.projectAction, styles.projectDelete]}>
              <Ionicons color={colors.danger} name="trash-outline" size={17} />
            </Pressable>
          </View>
        ))}
        <View style={styles.projectDivider} />
        <View style={styles.projectRow}>
          <SheetTextInput
            onChangeText={setNewProjectName}
            placeholder="新增项目名称"
            placeholderTextColor={colors.faint}
            style={styles.projectInput}
            value={newProjectName}
          />
          <Pressable
            disabled={!newProjectName.trim()}
            onPress={() => void addProject()}
            style={[styles.actionButton, styles.actionPrimary, { flex: 0, paddingHorizontal: 14 }, !newProjectName.trim() && { opacity: 0.45 }]}
          >
            <Ionicons color="#fff" name="add" size={20} />
          </Pressable>
        </View>
      </FormSheet>

      <SyncProgressModal
        completed={syncCompleted}
        progress={syncProgress}
        summary={syncSummary}
        visible={showSyncProgress}
      />
    </Screen>
  );
}
