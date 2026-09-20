import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, issuePriorities, issueStatuses, issueTypes, radius, spacing, typeface } from '@/src/shared/theme';
import type { IssueItem, IssuePriority, IssueStatus, IssueType } from '../types';
import { deriveStatus, formatIssueCode, formatRelativeTime } from '../utils';

const typeIcon: Record<IssueType, keyof typeof Ionicons.glyphMap> = {
  bug: 'bug-outline',
  chore: 'build-outline',
  docs: 'document-text-outline',
  ui: 'color-wand-outline',
};

export function TypeBadge({
  type,
  completed,
  onPress,
  size = 22,
}: {
  type?: IssueType | null;
  completed?: boolean;
  onPress?: () => void;
  size?: number;
}) {
  const key: IssueType = type || 'bug';
  const tone = issueTypes[key];
  const badgeStyle = {
    backgroundColor: completed ? issueStatuses.done.soft : tone.soft,
    height: size,
    width: size,
  };
  const content = (
    <View style={[styles.typeBadge, badgeStyle]}>
      <Ionicons
        color={completed ? issueStatuses.done.color : tone.color}
        name={completed ? 'checkmark' : typeIcon[key]}
        size={size * 0.62}
      />
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityLabel={completed ? '标记为未完成' : '标记为已完成'} hitSlop={10} onPress={onPress}>
      {content}
    </Pressable>
  );
}

export function PriorityTag({ priority }: { priority?: IssuePriority | null }) {
  const key: IssuePriority = priority || 'P2';
  const tone = issuePriorities[key];
  return (
    <View style={[styles.priorityTag, { backgroundColor: tone.soft }]}>
      <Text style={[styles.priorityText, { color: tone.color }]}>{key}</Text>
    </View>
  );
}

export function StatusTag({ status }: { status: IssueStatus }) {
  const tone = issueStatuses[status];
  return (
    <View style={[styles.statusTag, { backgroundColor: tone.soft }]}>
      {status === 'done' ? <Ionicons color={tone.color} name="checkmark" size={11} /> : null}
      <Text style={[styles.statusText, { color: tone.color }]}>{tone.label}</Text>
    </View>
  );
}

export function LabelTag({ label }: { label: string }) {
  return (
    <View style={styles.labelTag}>
      <Text style={styles.labelText}>{label}</Text>
    </View>
  );
}

export function GroupHeader({
  title,
  count,
  tone = colors.muted,
}: {
  title: string;
  count: number;
  tone?: string;
}) {
  return (
    <View style={styles.groupHeader}>
      <Text style={[styles.groupTitle, { color: tone }]}>{title.toUpperCase()}</Text>
      <View style={styles.groupLine} />
      <Text style={styles.groupCount}>{count}</Text>
    </View>
  );
}

export function ProgressBar({ ratio, color = colors.primary }: { ratio: number; color?: string }) {
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { backgroundColor: color, width: `${clamped * 100}%` }]} />
    </View>
  );
}

/** 列表行：类型徽标 + 编号 + 标题 + 项目 / 标签 / 文件 / 时间 + 优先级 */
export function IssueRow({
  issue,
  projectName,
  projectColor,
  onPress,
  onLongPress,
  onToggleComplete,
  compact = false,
  dense = false,
}: {
  issue: IssueItem;
  projectName?: string;
  projectColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  onToggleComplete?: () => void;
  compact?: boolean;
  /** 看板列里的窄卡片：只保留项目与第一个标签 */
  dense?: boolean;
}) {
  const status = deriveStatus(issue);
  const closed = status === 'done';
  const labels = (issue.labels || []).slice(0, dense ? 1 : 2);
  const meta: React.ReactNode[] = [];

  if (projectName) {
    meta.push(
      <View key="project" style={styles.metaItem}>
        <View style={[styles.projectDot, { backgroundColor: projectColor || colors.faint }]} />
        <Text style={styles.metaText}>{projectName}</Text>
      </View>,
    );
  }
  for (const label of labels) meta.push(<LabelTag key={`label-${label}`} label={label} />);

  return (
    <Pressable
      accessibilityRole="button"
      delayLongPress={320}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, compact && styles.rowCompact, closed && styles.rowClosed, pressed && styles.rowPressed]}
    >
      <TypeBadge completed={status === 'done'} onPress={onToggleComplete} type={issue.type} />
      <View style={styles.rowMain}>
        <View style={styles.rowTop}>
          <Text style={styles.rowCode}>{formatIssueCode(issue)}</Text>
          <Text numberOfLines={compact ? 1 : 2} style={[styles.rowTitle, closed && styles.rowTitleClosed]}>
            {issue.title}
          </Text>
        </View>
        {meta.length ? <View style={styles.rowMeta}>{meta}</View> : null}
      </View>
      <View style={styles.rowRight}>
        {status === 'done' || status === 'in_progress' ? (
          <StatusTag status={status} />
        ) : (
          <PriorityTag priority={issue.priority} />
        )}
        <Text style={styles.rowTime}>{formatRelativeTime(issue.updated_at || issue.created_at)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  typeBadge: {
    alignItems: 'center',
    borderRadius: 7,
    justifyContent: 'center',
  },
  priorityTag: {
    alignItems: 'center',
    borderRadius: 5,
    height: 19,
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  priorityText: {
    fontFamily: typeface.mono,
    fontSize: 10.5,
    fontWeight: '700',
  },
  statusTag: {
    alignItems: 'center',
    borderRadius: 5,
    flexDirection: 'row',
    gap: 3,
    height: 19,
    paddingHorizontal: 7,
  },
  statusText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  labelTag: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 5,
    height: 18,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  labelText: {
    color: colors.textSoft,
    fontSize: 10.5,
    fontWeight: '600',
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: 2,
    paddingTop: spacing.sm,
  },
  groupTitle: {
    fontFamily: typeface.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  groupLine: {
    backgroundColor: colors.border,
    flex: 1,
    height: 1,
  },
  groupCount: {
    color: colors.faint,
    fontFamily: typeface.mono,
    fontSize: 11,
  },
  progressTrack: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.full,
    height: 4,
    overflow: 'hidden',
  },
  progressFill: {
    borderRadius: radius.full,
    height: 4,
  },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.row,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.sm + 3,
    paddingVertical: spacing.sm + 2,
  },
  rowCompact: {
    paddingVertical: spacing.sm,
  },
  rowClosed: {
    backgroundColor: '#FBFCFC',
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowMain: {
    flex: 1,
    gap: 5,
    minWidth: 0,
    overflow: 'hidden',
  },
  rowTop: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 7,
  },
  rowCode: {
    color: colors.faint,
    fontFamily: typeface.mono,
    fontSize: 10.5,
    fontWeight: '600',
  },
  rowTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.1,
    lineHeight: 19,
  },
  rowTitleClosed: {
    color: colors.faint,
    textDecorationLine: 'line-through',
  },
  rowMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    overflow: 'hidden',
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  metaText: {
    color: colors.muted,
    fontSize: 11.5,
  },
  projectDot: {
    borderRadius: radius.full,
    height: 6,
    width: 6,
  },
  rowRight: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 6,
  },
  rowTime: {
    color: colors.faint,
    fontFamily: typeface.mono,
    fontSize: 10,
  },
});
