import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { setAudioModeAsync, setIsAudioActiveAsync, useAudioPlayer } from 'expo-audio';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, InteractionManager, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import {
  createIssueLocal,
  createIssueProjectLocal,
  deleteIssueLocal,
  deleteIssueProjectLocal,
  listIssueProjectsLocal,
  listIssuesLocal,
  reorderIssueProjectsLocal,
  updateIssueLocal,
  updateIssueProjectLocal,
} from '@/src/local/repositories/issuesRepository';
import { FormSheet, Header, IconButton, Screen, SheetTextInput, StateView } from '@/src/shared/components';
import { colors, useThemeColors } from '@/src/shared/theme';
import { runManualSync } from '@/src/sync/manualSync';
import type { SyncProgress } from '@/src/sync/syncProgress';
import { SwipeDeleteCard } from '../_shared/SwipeDeleteCard';
import { styles } from './styles';
import { SyncProgressModal } from './SyncProgressModal';
import type { IssueItem, IssueProject } from './types';
import { formatIssueDate, sortIssues } from './utils';

const completionFeedbackMs = 220;

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

function IssueQuickAdd({
  accentColor,
  disabled,
  onSubmit,
  placeholder,
}: {
  accentColor: string;
  disabled: boolean;
  onSubmit: (title: string) => Promise<boolean>;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const submittingRef = useRef(false);
  const trimmedDraft = draft.trim();

  const submit = useCallback(async () => {
    if (!trimmedDraft || disabled || submittingRef.current) return;
    submittingRef.current = true;
    try {
      const created = await onSubmit(trimmedDraft);
      // 写入过程中用户可以继续输入：只清掉已经提交的那条内容，不覆盖新输入
      if (created) setDraft((current) => (current.trim() === trimmedDraft ? '' : current));
    } finally {
      submittingRef.current = false;
    }
  }, [disabled, onSubmit, trimmedDraft]);

  return (
    <View style={styles.quickAdd}>
      <SheetTextInput
        blurOnSubmit={false}
        editable={!disabled}
        onChangeText={setDraft}
        onSubmitEditing={() => void submit()}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        returnKeyType="done"
        sheet={false}
        style={styles.quickInput}
        value={draft}
      />
      <Pressable
        disabled={disabled || !trimmedDraft}
        onPress={() => void submit()}
        style={[styles.addButton, { backgroundColor: accentColor }, (disabled || !trimmedDraft) && styles.disabled]}
      >
        <Ionicons color="#fff" name="add" size={22} />
      </Pressable>
    </View>
  );
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

export function IssueScreen() {
  const themeColors = useThemeColors();
  const completeSoundPlayer = useAudioPlayer(require('../../../../assets/sounds/todo-complete-ding.wav'), { downloadFirst: true, keepAudioSessionActive: true });
  const initialSnapshot = getCachedIssueScreenSnapshot();
  const [projects, setProjects] = useState<IssueProject[]>(() => initialSnapshot?.projects ?? []);
  const [issues, setIssues] = useState<IssueItem[]>(() => initialSnapshot?.issues ?? []);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(() => initialSnapshot?.projects[0]?.key ?? null);
  const [editingIssue, setEditingIssue] = useState<IssueItem | null>(null);
  const [issueDraftTitle, setIssueDraftTitle] = useState('');
  const [projectNames, setProjectNames] = useState<Record<string, string>>(() => projectNamesFromProjects(initialSnapshot?.projects ?? []));
  const [newProjectName, setNewProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(Boolean(initialSnapshot));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // 「同步中」弹窗：进度来自 runManualSync 的阶段上报
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncCompleted, setSyncCompleted] = useState(false);
  const [syncSummary, setSyncSummary] = useState<string | undefined>(undefined);
  const [showSyncProgress, setShowSyncProgress] = useState(false);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackIssueIds, setFeedbackIssueIds] = useState<string[]>([]);
  const projectSheetRef = useRef<BottomSheetModal>(null);
  const completionFeedbackTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await readIssueScreenSnapshot();
      setProjects(snapshot.projects);
      setIssues(snapshot.issues);
      setSelectedProjectKey((current) => snapshot.projects.some((project) => project.key === current) ? current : (snapshot.projects[0]?.key || null));
      setProjectNames(projectNamesFromProjects(snapshot.projects));
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 Issue 失败');
    } finally {
      setLoading(false);
      setHydrated(true);
    }
  }, []);

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
      // 完成态停留一下再关窗，让用户看到最后一步打勾
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

  const selectedProject = projects.find((project) => project.key === selectedProjectKey);
  const visibleIssues = useMemo(
    () => {
      const projectIssues = issues.filter((issue) => issue.project_key === selectedProjectKey);
      return feedbackIssueIds.length ? projectIssues : sortIssues(projectIssues);
    },
    [feedbackIssueIds.length, issues, selectedProjectKey],
  );
  const openCount = visibleIssues.filter((issue) => !issue.is_completed).length;

  const addQuickIssue = useCallback(async (title: string) => {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return false;
    if (!selectedProjectKey) {
      Alert.alert('请先添加项目', '点击右上角“编辑”添加项目后，再记录 Issue。');
      projectSheetRef.current?.present();
      return false;
    }
    setSaving(true);
    try {
      const created = await createIssueLocal({ project_key: selectedProjectKey, title: normalizedTitle, is_completed: false });
      setIssues((current) => {
        const nextIssues = sortIssues([created, ...current]);
        setCachedIssueScreenSnapshot({ projects, issues: nextIssues });
        return nextIssues;
      });
      return true;
    } catch (err) {
      Alert.alert('新增失败', err instanceof Error ? err.message : '请稍后重试');
      return false;
    } finally {
      setSaving(false);
    }
  }, [projects, selectedProjectKey]);

  const toggleIssue = useCallback(async (issue: IssueItem) => {
    try {
      const nextCompleted = !issue.is_completed;
      const updated = await updateIssueLocal(issue.id, {
        is_completed: nextCompleted,
        completed_at: nextCompleted ? new Date().toISOString() : null,
      });
      if (updated) setIssues((current) => {
        const nextIssues = current.map((item) => item.id === issue.id ? updated : item);
        setCachedIssueScreenSnapshot({ projects, issues: nextIssues });
        return nextIssues;
      });
      if (nextCompleted) {
        setFeedbackIssueIds((current) => current.includes(issue.id) ? current : [...current, issue.id]);
        if (completionFeedbackTimersRef.current[issue.id]) clearTimeout(completionFeedbackTimersRef.current[issue.id]);
        completionFeedbackTimersRef.current[issue.id] = setTimeout(() => {
          setIssues((current) => {
            const nextIssues = sortIssues(current);
            setCachedIssueScreenSnapshot({ projects, issues: nextIssues });
            return nextIssues;
          });
          setFeedbackIssueIds((current) => current.filter((id) => id !== issue.id));
          delete completionFeedbackTimersRef.current[issue.id];
        }, completionFeedbackMs);
        completeSoundPlayer.muted = false;
        completeSoundPlayer.volume = 0.42;
        void completeSoundPlayer.seekTo(0).then(() => completeSoundPlayer.play()).catch(() => completeSoundPlayer.play());
      } else if (updated) {
        setIssues((current) => {
          const nextIssues = sortIssues(current);
          setCachedIssueScreenSnapshot({ projects, issues: nextIssues });
          return nextIssues;
        });
      }
    } catch (err) {
      Alert.alert('更新失败', err instanceof Error ? err.message : '请稍后重试');
    }
  }, [completeSoundPlayer, projects]);

  const openIssueEditor = useCallback((issue: IssueItem) => {
    setEditingIssue(issue);
    setIssueDraftTitle(issue.title);
  }, []);

  const closeIssueEditor = useCallback(() => {
    setEditingIssue(null);
    setIssueDraftTitle('');
  }, []);

  const saveIssue = async () => {
    if (!editingIssue) return;
    const title = issueDraftTitle.trim();
    if (!title) {
      Alert.alert('缺少标题', '请填写 Issue 标题。');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateIssueLocal(editingIssue.id, { title });
      if (updated) setIssues((current) => {
        const nextIssues = sortIssues(current.map((item) => item.id === editingIssue.id ? updated : item));
        setCachedIssueScreenSnapshot({ projects, issues: nextIssues });
        return nextIssues;
      });
      closeIssueEditor();
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const removeIssue = useCallback((issue: IssueItem, onDeleted?: () => void) => {
    Alert.alert('删除确认', `确定删除「${issue.title}」吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteIssueLocal(issue.id);
          onDeleted?.();
          await loadData();
        },
      },
    ]);
  }, [loadData]);

  const addProject = async () => {
    const name = newProjectName.trim();
    if (!name) return;
    try {
      const created = await createIssueProjectLocal(name);
      setNewProjectName('');
      await loadData();
      setSelectedProjectKey(created.key);
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
      await reorderIssueProjectsLocal(nextProjects.map(p => p.key));
    } catch (err) {
      Alert.alert('调整顺序失败', err instanceof Error ? err.message : '请稍后重试');
      await loadData();
    }
  };

  const renderIssueItem = useCallback(({ item: issue }: { item: IssueItem }) => (
    <SwipeDeleteCard
      onDelete={() => removeIssue(issue)}
      onSwipeActiveChange={(active) => setScrollEnabled(!active)}
    >
      <Pressable
        delayLongPress={350}
        onLongPress={() => openIssueEditor(issue)}
        style={styles.issueCard}
      >
        <Pressable
          hitSlop={8}
          onPress={() => void toggleIssue(issue)}
          style={[
            styles.checkCircle,
            issue.is_completed && styles.checkCircleDone,
            issue.is_completed && { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
          ]}
        >
          {issue.is_completed ? <Ionicons color="#fff" name="checkmark" size={16} /> : null}
        </Pressable>
        <View style={styles.issueMain}>
          <Text style={[styles.issueTitle, issue.is_completed && styles.completed]}>{issue.title}</Text>
          {issue.description ? <Text style={styles.description}>{issue.description}</Text> : null}
          {issue.due_date || issue.due_time || issue.location ? (
            <View style={styles.metadata}>
              {issue.due_date || issue.due_time ? (
                <View style={styles.metadataItem}>
                  <Ionicons color={colors.muted} name="time-outline" size={12} />
                  <Text style={styles.metadataText}>{formatIssueDate(issue.due_date)}{issue.due_time ? ` ${issue.due_time}` : ''}</Text>
                </View>
              ) : null}
              {issue.location ? (
                <View style={styles.metadataItem}>
                  <Ionicons color={colors.muted} name="location-outline" size={12} />
                  <Text style={styles.metadataText}>{issue.location}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Pressable>
    </SwipeDeleteCard>
  ), [removeIssue, themeColors.primary, toggleIssue, openIssueEditor]);

  const issueListHeader = useMemo(() => (
    <>
      <ScrollView
        contentContainerStyle={styles.projectTabs}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.projectScroller}
      >
        {projects.map((project) => {
          const selected = project.key === selectedProjectKey;
          return (
            <Pressable
              key={project.key}
              onPress={() => setSelectedProjectKey(project.key)}
              style={styles.projectTab}
            >
              <Text style={[styles.projectTabText, selected && styles.projectTabTextSelected, selected && { color: themeColors.primary }]}>{project.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <IssueQuickAdd
        accentColor={themeColors.primary}
        disabled={!selectedProjectKey}
        onSubmit={addQuickIssue}
        placeholder={selectedProject ? `添加 ${selectedProject.name} 的 Issue...` : '请先添加项目'}
      />
      <StateView error={error} loading={loading && !hydrated} onRetry={loadData} />
    </>
  ), [addQuickIssue, error, hydrated, loadData, loading, projects, selectedProject, selectedProjectKey, themeColors.primary]);

  const renderIssueEmpty = () => {
    if (!hydrated || error) return null;
    return (
      <View style={styles.emptyState}>
        <Ionicons color={colors.faint} name="alert-circle-outline" size={36} />
        <Text style={styles.emptyTitle}>{selectedProject ? '暂无 Issue' : '暂无项目'}</Text>
        <Text style={styles.emptyText}>{selectedProject ? '在当前项目记录一项需要处理的问题' : '点击右上角“编辑”添加第一个项目'}</Text>
      </View>
    );
  };

  return (
    <Screen>
      <Header
        centered
        title="Issue"
        subtitle={selectedProject ? `${selectedProject.name} · ${openCount} 项待处理` : '请先添加项目'}
        action={<IconButton name="settings-outline" label="设置" transparent onPress={() => router.push('/settings' as never)} />}
        rightAction={(
          <View style={styles.headerActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => projectSheetRef.current?.present()}
              style={styles.headerEditButton}
            >
              <Text numberOfLines={1} style={[styles.headerEdit, { color: themeColors.primary }]}>编辑</Text>
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
      />
      <FlatList
        alwaysBounceVertical={false}
        bounces={false}
        contentContainerStyle={styles.content}
        data={hydrated && !error ? visibleIssues : []}
        initialNumToRender={12}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={renderIssueEmpty}
        ListHeaderComponent={issueListHeader}
        maxToRenderPerBatch={8}
        overScrollMode="never"
        renderItem={renderIssueItem}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        style={styles.noScrollBounce}
        windowSize={7}
      />
      <FormSheet bottomSheetRef={projectSheetRef} contentStyle={styles.modalContent}>
        <Text style={styles.sheetTitle}>编辑项目</Text>
        {projects.map((project, index) => (
          <View key={project.key} style={styles.projectRow}>
            <SheetTextInput
              onChangeText={(value) => setProjectNames((current) => ({ ...current, [project.key]: value }))}
              placeholder="项目名称"
              placeholderTextColor={colors.faint}
              style={styles.projectInput}
              value={projectNames[project.key] || ''}
            />
            <Pressable disabled={index === 0} onPress={() => moveProject(index, -1)} style={[styles.projectAction, index === 0 && { opacity: 0.3 }]}>
              <Ionicons color={colors.textSoft} name="chevron-up" size={20} />
            </Pressable>
            <Pressable disabled={index === projects.length - 1} onPress={() => moveProject(index, 1)} style={[styles.projectAction, index === projects.length - 1 && { opacity: 0.3 }]}>
              <Ionicons color={colors.textSoft} name="chevron-down" size={20} />
            </Pressable>
            <Pressable onPress={() => void saveProjectName(project)} style={styles.projectAction}>
              <Ionicons color={themeColors.primary} name="checkmark" size={20} />
            </Pressable>
            <Pressable onPress={() => removeProject(project)} style={[styles.projectAction, styles.projectDelete]}>
              <Ionicons color={colors.danger} name="trash-outline" size={19} />
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
          <Pressable disabled={!newProjectName.trim()} onPress={() => void addProject()} style={[styles.addButton, { backgroundColor: themeColors.primary }, !newProjectName.trim() && styles.disabled]}>
            <Ionicons color="#fff" name="add" size={22} />
          </Pressable>
        </View>
      </FormSheet>
      <Modal
        animationType="fade"
        transparent
        visible={Boolean(editingIssue)}
        onRequestClose={closeIssueEditor}
      >
        <Pressable style={styles.issueEditorOverlay} onPress={closeIssueEditor}>
          <Pressable style={styles.issueEditorPanel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.issueEditorHeader}>
              <Text style={styles.issueEditorTitle}>编辑 Issue</Text>
              <Pressable accessibilityLabel="关闭 Issue 编辑" accessibilityRole="button" style={styles.issueEditorClose} onPress={closeIssueEditor}>
                <Ionicons color={colors.textSoft} name="close" size={20} />
              </Pressable>
            </View>
            <SheetTextInput
              autoFocus
              onChangeText={setIssueDraftTitle}
              placeholder="Issue 标题"
              placeholderTextColor={colors.faint}
              returnKeyType="done"
              sheet={false}
              style={styles.issueEditorInput}
              value={issueDraftTitle}
            />
            <View style={styles.issueEditorActions}>
              <Pressable
                accessibilityRole="button"
                style={[styles.issueEditorButton, styles.issueEditorDeleteButton]}
                onPress={() => {
                  if (editingIssue) removeIssue(editingIssue, closeIssueEditor);
                }}
              >
                <Ionicons color={colors.danger} name="trash-outline" size={18} />
                <Text style={[styles.issueEditorButtonText, styles.issueEditorDeleteText]}>删除</Text>
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.issueEditorButton} onPress={closeIssueEditor}>
                <Text style={styles.issueEditorButtonText}>取消</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={saving || !issueDraftTitle.trim()}
                onPress={() => void saveIssue()}
                style={[
                  styles.issueEditorButton,
                  styles.issueEditorSaveButton,
                  { backgroundColor: themeColors.primary, borderColor: themeColors.primary },
                  (saving || !issueDraftTitle.trim()) && styles.disabled,
                ]}
              >
                <Ionicons color="#fff" name="checkmark" size={18} />
                <Text style={styles.issueEditorSaveText}>保存</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <SyncProgressModal
        visible={showSyncProgress}
        progress={syncProgress}
        completed={syncCompleted}
        summary={syncSummary}
      />
    </Screen>
  );
}
