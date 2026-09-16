// 同步进度上报测试：「同步中」弹窗的进度必须来自真实阶段，且不能回退。
// 纯函数直接 import 跑断言；接线部分用源码断言，和本仓库其它 test-*.mjs 一致。
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import {
  SYNC_PHASE_ORDER,
  SYNC_PROGRESS_COMPLETE,
  countProgress,
  phasePercent,
  phaseStepState,
  ratioProgress,
} from '../src/sync/syncProgress.ts';

function read(path) {
  assert.ok(existsSync(path), `Missing file: ${path}`);
  return readFileSync(path, 'utf8');
}

// --- 1) 区间与文案 ---
const half = countProgress('upload', 5, 10, ' 项');
assert.equal(half.percent, 18, '10 项里传完 5 项应该是整体 18%');
assert.equal(half.ratio, 0.5, '阶段内比例应该是 0.5');
assert.equal(half.detail, '上传本地改动 5/10 项', '阶段说明要带计数和单位');

const skipped = countProgress('upload', 0, 0, ' 项');
assert.equal(skipped.percent, 35, '没有本地改动时不该卡在上传阶段');
assert.equal(skipped.detail, '上传本地改动', '没有总量时只显示阶段名');

assert.equal(countProgress('upload', 99, 10, ' 项').done, 10, '完成数不能超过总数');
assert.equal(phasePercent('upload', 1), 35, '上传阶段结束应落在 35%');
assert.equal(phasePercent('pull', 1), 65, '拉取阶段结束应落在 65%');
assert.equal(phasePercent('settings', 1), 85, '设置阶段结束应落在 85%');
assert.equal(phasePercent('finalize', 1), 100, '收尾阶段结束应落在 100%');
assert.equal(ratioProgress('settings', 0.5).percent, 75, '显式比例也要落在自己的区间里');
assert.equal(SYNC_PROGRESS_COMPLETE.percent, 100, '收尾进度是 100%');

// --- 2) 进度只能单调递增 ---
let previous = -1;
for (const phase of SYNC_PHASE_ORDER) {
  for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
    const percent = phasePercent(phase, ratio);
    assert.ok(percent >= previous, `${phase}@${ratio} 的百分比不该比上一步低`);
    previous = percent;
  }
}
assert.equal(previous, 100, '走完四个阶段应该正好到 100%');

// --- 3) 步骤状态 ---
assert.equal(phaseStepState('upload', 'pull', false), 'done', '当前阶段之前的步骤应打勾');
assert.equal(phaseStepState('pull', 'pull', false), 'active', '当前阶段应该在转圈');
assert.equal(phaseStepState('settings', 'pull', false), 'pending', '还没到的阶段应留空');
assert.equal(phaseStepState('upload', null, false), 'pending', '还没开始时不显示进度');
assert.equal(phaseStepState('settings', 'pull', true), 'done', '完成态所有步骤都打勾');

// --- 4) 接线：同步真的会按四个阶段上报 ---
const sync = read('src/sync/manualSync.ts');
assert.match(sync, /onProgress\?: SyncProgressListener/, 'runManualSync 应该接受进度回调');
for (const phase of SYNC_PHASE_ORDER) {
  assert.match(sync, new RegExp(`['"]${phase}['"]`), `runManualSync 应该上报 ${phase} 阶段`);
}
assert.match(sync, /SYNC_PROGRESS_COMPLETE/, '同步收尾应该报 100%');

const screen = read('src/features/daily/issues/IssueScreen.tsx');
assert.match(screen, /<SyncProgressModal/, 'Issue 页应该渲染同步进度弹窗');
assert.match(screen, /runManualSync\(\{ onProgress: setSyncProgress \}\)/, 'Issue 页应该把进度回调接进同步');
assert.match(screen, /visible=\{showSyncProgress\}/, '弹窗显示应该跟随同步状态');

console.log('Issue sync progress checks passed.');
