// 同步进度上报：给「同步中」弹窗提供一份可直接渲染的进度快照。
//
// 四个阶段共享同一条 0-100 的整体进度，区间按 runManualSync 的真实顺序排：
//   上传本地改动 0-35 → 拉取云端数据 35-65 → 同步设置 65-85 → 写回本地数据 85-100
// 阶段内按「完成数 / 总数」推进；没有可数总量的阶段用显式比例。
// 纯函数，不碰 IO，方便脚本直接测。

export type SyncPhase = 'upload' | 'pull' | 'settings' | 'finalize';

export const SYNC_PHASE_ORDER: SyncPhase[] = ['upload', 'pull', 'settings', 'finalize'];

export const SYNC_PHASE_LABEL: Record<SyncPhase, string> = {
  upload: '上传本地改动',
  pull: '拉取云端数据',
  settings: '同步设置',
  finalize: '写回本地数据',
};

export const SYNC_PHASE_RANGE: Record<SyncPhase, { start: number; end: number }> = {
  upload: { start: 0, end: 35 },
  pull: { start: 35, end: 65 },
  settings: { start: 65, end: 85 },
  finalize: { start: 85, end: 100 },
};

export type SyncProgress = {
  phase: SyncPhase;
  /** 整体进度 0-100 */
  percent: number;
  /** 阶段内已完成数 */
  done: number;
  /** 阶段内总数；null 表示这一阶段没有可数的总量 */
  total: number | null;
  /** 阶段内比例 0-1 */
  ratio: number;
  /** 一行中文说明，例如「上传本地改动 3/12 项」 */
  detail: string;
};

export type SyncProgressListener = (progress: SyncProgress) => void;

export type SyncStepState = 'done' | 'active' | 'pending';

export function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function phasePercent(phase: SyncPhase, ratio: number) {
  const { start, end } = SYNC_PHASE_RANGE[phase];
  return Math.round(start + (end - start) * clampRatio(ratio));
}

export function phaseDetail(phase: SyncPhase, done: number, total: number | null, unit = '') {
  const label = SYNC_PHASE_LABEL[phase];
  if (total === null || total <= 0) return label;
  return `${label} ${Math.min(Math.max(done, 0), total)}/${total}${unit}`;
}

/** 有明确总量的阶段：按完成数推进 */
export function countProgress(phase: SyncPhase, done: number, total: number, unit = ''): SyncProgress {
  const safeTotal = Math.max(0, Math.round(total));
  const safeDone = Math.min(Math.max(Math.round(done), 0), safeTotal);
  // 总数是 0 说明这一阶段没活要干，直接算完成，进度不要卡在这里
  const ratio = safeTotal > 0 ? clampRatio(safeDone / safeTotal) : 1;
  return {
    phase,
    done: safeDone,
    total: safeTotal,
    ratio,
    percent: phasePercent(phase, ratio),
    detail: phaseDetail(phase, safeDone, safeTotal, unit),
  };
}

/** 没有可数总量的阶段：显式给比例和文案 */
export function ratioProgress(phase: SyncPhase, ratio: number, detail?: string): SyncProgress {
  const safeRatio = clampRatio(ratio);
  return {
    phase,
    done: 0,
    total: null,
    ratio: safeRatio,
    percent: phasePercent(phase, safeRatio),
    detail: detail || SYNC_PHASE_LABEL[phase],
  };
}

/** 收尾：整体 100%，弹窗切到完成态 */
export const SYNC_PROGRESS_COMPLETE: SyncProgress = {
  phase: 'finalize',
  done: 0,
  total: null,
  ratio: 1,
  percent: 100,
  detail: '同步完成',
};

/** 步骤行状态：靠阶段顺序推导，已完成的阶段打勾，当前阶段转圈，后面留空 */
export function phaseStepState(phase: SyncPhase, current: SyncPhase | null, completed: boolean): SyncStepState {
  if (completed) return 'done';
  if (!current) return 'pending';
  const currentIndex = SYNC_PHASE_ORDER.indexOf(current);
  const index = SYNC_PHASE_ORDER.indexOf(phase);
  if (index < currentIndex) return 'done';
  if (index === currentIndex) return 'active';
  return 'pending';
}
