// 「同步中」弹窗：步骤清单 + 进度条。
//
// 进度数据来自 src/sync/syncProgress.ts —— 手动同步时 runManualSync 会按
// 上传本地改动 / 拉取云端数据 / 同步设置 / 写回本地数据 四个阶段上报。
// 弹窗只负责显示：阶段状态由阶段顺序推导，计数按阶段各自记住最后一次的值。
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadow, spacing, useThemeColors } from '@/src/shared/theme';
import {
  SYNC_PHASE_LABEL,
  SYNC_PHASE_ORDER,
  phaseStepState,
  type SyncPhase,
  type SyncProgress,
  type SyncStepState,
} from '@/src/sync/syncProgress';

type StepCount = { done: number; total: number | null };

function stepCountLabel(state: SyncStepState, count?: StepCount) {
  if (!count || count.total === null) return state === 'done' ? '完成' : '—';
  if (state === 'pending') return '—';
  if (state === 'done') return `${count.total}/${count.total}`;
  return `${count.done}/${count.total}`;
}

export function SyncProgressModal({
  visible,
  progress,
  completed = false,
  summary,
}: {
  visible: boolean;
  progress: SyncProgress | null;
  /** 同步已经跑完，弹窗切到完成态（打勾 + 100%），等上层收尾再关闭 */
  completed?: boolean;
  /** 完成态那一行摘要，例如「已同步 12 项 · 下载 18 项」 */
  summary?: string;
}) {
  const themeColors = useThemeColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const [counts, setCounts] = useState<Partial<Record<SyncPhase, StepCount>>>({});
  const fill = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  const percent = completed ? 100 : progress?.percent ?? 0;
  const ratio = percent / 100;
  const currentPhase = completed ? null : progress?.phase ?? null;

  // 每次打开都从零开始，别把上一轮的步骤计数带过来
  useEffect(() => {
    if (!visible) return;
    setCounts({});
    fill.setValue(0);
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [visible, entrance, fill]);

  // 进度条按上报值推进（宽度只能走 JS 驱动）
  useEffect(() => {
    if (!visible) return;
    Animated.timing(fill, {
      toValue: ratio,
      duration: 280,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [visible, ratio, fill]);

  // 转圈：标题图标与当前阶段图标共用
  useEffect(() => {
    if (!visible) return;
    spin.setValue(0);
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, spin]);

  // 进度条上扫过的高光，表示「还在动」
  useEffect(() => {
    if (!visible) return;
    sweep.setValue(0);
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, sweep]);

  useEffect(() => {
    if (!progress) return;
    setCounts((previous) => {
      const seen = previous[progress.phase];
      if (seen && seen.done === progress.done && seen.total === progress.total) return previous;
      return { ...previous, [progress.phase]: { done: progress.done, total: progress.total } };
    });
  }, [progress]);

  const barWidth = Math.max(trackWidth, 1);
  const fillWidth = fill.interpolate({ inputRange: [0, 1], outputRange: [0, barWidth] });
  const sweepTranslate = sweep.interpolate({ inputRange: [0, 1], outputRange: [-barWidth * 0.5, barWidth] });
  const spinDeg = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const detail = completed ? summary || '已完成本次同步' : progress?.detail || '准备同步…';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
      <View style={styles.scrim}>
        <Animated.View
          accessibilityLiveRegion="polite"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={[
            styles.dialog,
            {
              opacity: entrance,
              transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }],
            },
          ]}
        >
          <View style={styles.head}>
            {completed ? (
              <Ionicons name="checkmark" size={19} color={colors.success} />
            ) : (
              <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
                <Ionicons name="sync" size={18} color={themeColors.primary} />
              </Animated.View>
            )}
            <Text style={styles.title}>{completed ? '同步完成' : '正在同步'}</Text>
          </View>

          <View style={styles.track} onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}>
            <Animated.View style={[styles.fill, { backgroundColor: themeColors.primary, width: fillWidth }]} />
            {completed ? null : (
              <Animated.View
                pointerEvents="none"
                style={[styles.sweep, { transform: [{ translateX: sweepTranslate }] }]}
              />
            )}
          </View>

          <View style={styles.barMeta}>
            <Text numberOfLines={1} style={styles.metaDetail}>{detail}</Text>
            <Text style={styles.metaPercent}>{percent}%</Text>
          </View>

          <View style={styles.steps}>
            {SYNC_PHASE_ORDER.map((phase) => {
              const state = phaseStepState(phase, currentPhase, completed);
              return (
                <View key={phase} style={styles.step}>
                  <View
                    style={[
                      styles.stepIcon,
                      state === 'done' && styles.stepIconDone,
                      state === 'active' && { backgroundColor: themeColors.primarySoft },
                    ]}
                  >
                    {state === 'done' ? <Ionicons name="checkmark" size={12} color={colors.success} /> : null}
                    {state === 'active' ? (
                      <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
                        <Ionicons name="sync" size={12} color={themeColors.primary} />
                      </Animated.View>
                    ) : null}
                    {state === 'pending' ? <View style={styles.stepDot} /> : null}
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.stepLabel,
                      state === 'done' && styles.stepLabelDone,
                      state === 'active' && styles.stepLabelActive,
                    ]}
                  >
                    {SYNC_PHASE_LABEL[phase]}
                  </Text>
                  <Text style={[styles.stepCount, state === 'active' && styles.stepCountActive]}>
                    {stepCountLabel(state, counts[phase])}
                  </Text>
                </View>
              );
            })}
          </View>

          <Text style={styles.foot}>{completed ? '正在整理结果…' : '请保持网络连接，不要关闭 App'}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.xxl,
    maxWidth: 340,
    paddingBottom: spacing.lg,
    paddingHorizontal: 18,
    paddingTop: 20,
    width: '100%',
    ...shadow,
  },
  head: { alignItems: 'center', flexDirection: 'row', gap: 7, justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16.5, fontWeight: '700', lineHeight: 22 },
  track: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 4,
    height: 8,
    marginTop: 14,
    overflow: 'hidden',
  },
  fill: { bottom: 0, left: 0, position: 'absolute', top: 0 },
  sweep: { backgroundColor: 'rgba(255, 255, 255, 0.38)', bottom: 0, position: 'absolute', top: 0, width: 56 },
  barMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  metaDetail: { color: colors.muted, flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  metaPercent: { color: colors.textSoft, fontSize: 12, fontWeight: '700', lineHeight: 16, marginLeft: spacing.sm },
  steps: { gap: 9, marginTop: 14 },
  step: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  stepIcon: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  stepIconDone: { backgroundColor: colors.successSoft },
  stepDot: { borderColor: colors.faint, borderRadius: 4, borderWidth: 1.5, height: 7, width: 7 },
  stepLabel: { color: colors.faint, flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  stepLabelDone: { color: colors.textSoft },
  stepLabelActive: { color: colors.text },
  stepCount: { color: colors.faint, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  stepCountActive: { color: colors.textSoft },
  foot: { color: colors.faint, fontSize: 11.5, lineHeight: 16, marginTop: 14, textAlign: 'center' },
});
