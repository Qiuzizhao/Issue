import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import vm from 'node:vm';
import ts from 'typescript';

import { createSyncTask } from '../src/sync/syncTask.ts';
import { startAutoSync } from '../src/sync/autoSyncLifecycle.ts';
import { mergeSyncRecords, preserveConcurrentChanges } from '../src/sync/syncMerge.ts';
import * as progress from '../src/sync/syncProgress.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('automatic and repeated manual callers share one task, including during session lookup', async () => {
  const gate = deferred();
  let calls = 0;
  const task = createSyncTask(async () => { calls++; await gate.promise; return 'done'; });
  const automatic = task.run();
  const manual = task.run();
  assert.equal(automatic, manual);
  assert.equal(task.run(), automatic);
  await delay(0);
  assert.equal(calls, 1);
  gate.resolve();
  assert.equal(await manual, 'done');
  assert.equal(task.getState().status, 'succeeded');
});

test('late manual caller receives current progress and subsequent progress from the same task', async () => {
  const gate = deferred();
  const task = createSyncTask(async (report) => {
    report(progress.ratioProgress('pull', 0.5));
    await gate.promise;
    report(progress.SYNC_PROGRESS_COMPLETE);
    return 'done';
  });
  const background = task.run();
  await delay(0);
  const received = [];
  const manual = task.run({ onProgress: (value) => received.push(value.percent) });
  assert.equal(background, manual);
  assert.equal(received[0], 50);
  gate.resolve();
  await manual;
  assert.ok(received.includes(100));
});

test('failure is shared and the next request can retry', async () => {
  let calls = 0;
  const failure = new Error('offline');
  const task = createSyncTask(async () => { if (++calls === 1) throw failure; return 'retried'; });
  const first = task.run();
  const second = task.run();
  const outcomes = await Promise.allSettled([first, second]);
  assert.ok(outcomes.every((outcome) => outcome.reason === failure));
  assert.equal(task.getState().status, 'failed');
  assert.equal(await task.run(), 'retried');
  assert.equal(calls, 2);
});

test('a broken observer cannot fail the shared sync or leak into subsequent tasks', async () => {
  const task = createSyncTask(async (report) => { report(progress.SYNC_PROGRESS_COMPLETE); return 'done'; });
  assert.equal(await task.run({ onProgress: () => { throw new Error('UI unmounted'); } }), 'done');
  let received = 0;
  await task.run({ onProgress: () => received++ });
  const previous = received;
  await task.run();
  assert.equal(received, previous);
});

function lifecycle({ signedIn = 'user-a', appState = 'active', sync = async () => undefined, bootstrap } = {}) {
  let auth, app, mode;
  let calls = 0;
  const dispose = startAutoSync({
    getUserId: () => bootstrap ?? Promise.resolve(signedIn),
    subscribeUser: (listener) => { auth = listener; return () => { auth = null; }; },
    currentAppState: () => appState,
    subscribeAppState: (listener) => { app = listener; return () => { app = null; }; },
    subscribeLocalMode: (listener) => { mode = listener; return () => { mode = null; }; },
    sync: async () => { calls++; return sync(); },
  });
  return { auth: (id) => auth(id), app: (state) => app(state), mode: (enabled) => mode(enabled), calls: () => calls, dispose };
}
const flush = () => delay(15);

test('signed-in cold start syncs once; repeated auth and token-refresh events do not repeat it', async () => {
  const life = lifecycle();
  await flush();
  life.auth('user-a'); life.auth('user-a');
  await flush();
  assert.equal(life.calls(), 1);
  life.dispose();
});

test('signed-out launch is quiet; signing in starts a background sync', async () => {
  const life = lifecycle({ signedIn: null });
  await flush();
  assert.equal(life.calls(), 0);
  life.auth('user-a');
  await flush();
  assert.equal(life.calls(), 1);
  life.dispose();
});

test('returning from background syncs each time; transient inactive state does not', async () => {
  const life = lifecycle();
  await flush();
  life.app('inactive'); life.app('active');
  await flush();
  assert.equal(life.calls(), 1);
  life.app('background'); life.app('inactive'); life.app('active');
  await flush();
  assert.equal(life.calls(), 2);
  life.app('background'); life.app('active');
  await flush();
  assert.equal(life.calls(), 3);
  life.dispose();
});

test('background launch waits until foreground; disabling local mode triggers a check', async () => {
  const life = lifecycle({ appState: 'background' });
  await flush();
  assert.equal(life.calls(), 0);
  life.app('active');
  await flush();
  assert.equal(life.calls(), 1);
  life.mode(true);
  await flush();
  assert.equal(life.calls(), 1);
  life.mode(false);
  await flush();
  assert.equal(life.calls(), 2);
  life.dispose();
});

test('auth event takes precedence over stale bootstrap session, and dispose cancels work', async () => {
  const bootstrap = deferred();
  const life = lifecycle({ bootstrap: bootstrap.promise });
  life.auth(null);
  bootstrap.resolve('stale-user');
  await flush();
  assert.equal(life.calls(), 0);
  life.auth('user-a');
  life.dispose();
  await flush();
  assert.equal(life.calls(), 0);
});

test('automatic offline failures stay quiet and the next foreground retries', async () => {
  const life = lifecycle({ sync: async () => { throw new Error('offline'); } });
  await flush();
  life.app('background'); life.app('active');
  await flush();
  assert.equal(life.calls(), 2);
  life.dispose();
});

test('foreground and manual requests during background sync still execute the pipeline once', async () => {
  const gate = deferred();
  let executions = 0;
  const task = createSyncTask(async () => { executions++; await gate.promise; });
  const life = lifecycle({ sync: task.run });
  await flush();
  life.app('background'); life.app('active');
  const manual = task.run();
  await flush();
  assert.equal(executions, 1);
  gate.resolve();
  await manual;
  life.dispose();
});

test('concurrent creates, edits and deletes stay pending while remote changes are downloaded', () => {
  const snapshot = [
    { id: 'edit', title: 'before', sync_status: 'pending' },
    { id: 'delete', title: 'before', sync_status: 'pending' },
    { id: 'same', title: 'uploaded', sync_status: 'pending' },
  ];
  const latest = [
    { ...snapshot[0], title: 'new edit' },
    { ...snapshot[1], deleted_at: '2026-11-04T10:00:00Z' },
    snapshot[2],
    { id: 'create', title: 'new item', sync_status: 'pending' },
  ];
  const merged = [
    ...snapshot.map((record) => ({ ...record, sync_status: 'synced' })),
    { id: 'remote', title: 'downloaded', sync_status: 'synced' },
  ];
  const result = new Map(preserveConcurrentChanges(snapshot, latest, merged).map((record) => [record.id, record]));
  assert.equal(result.get('edit').title, 'new edit');
  for (const id of ['edit', 'delete', 'create']) assert.equal(result.get(id).sync_status, 'pending');
  assert.ok(result.get('delete').deleted_at);
  for (const id of ['same', 'remote']) assert.equal(result.get(id).sync_status, 'synced');
});

function loadModule(path, dependencies) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext('(function(require, exports) {' + outputText + '\n})', { console, Promise, Date, Set, Map })((name) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }, exports);
  return exports;
}

function pipeline({ localMode = false, session = { user: { id: 'user-a' } }, gate } = {}) {
  let requests = 0, sessionReads = 0;
  const settings = { updated_at: '2026-11-01T00:00:00Z', sync_status: 'synced' };
  const remote = { issue_projects: [], issue_items: [], issue_settings: { ...settings, user_id: 'user-a' } };
  const client = {
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        async upsert() { requests++; return { error: null }; },
        async maybeSingle() { requests++; return { data: remote[table], error: null }; },
        then(resolve, reject) {
          requests++;
          return Promise.resolve(gate?.promise).then(() => ({ data: remote[table], error: null })).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const exports = loadModule('../src/sync/manualSync.ts', {
    '@/src/local/repositories/issuesRepository': {
      listIssueProjectsForSync: async () => [], listIssuesForSync: async () => [],
      replaceIssueProjectsFromSync: async () => {}, replaceIssuesFromSync: async () => {},
    },
    '@/src/local/settingsRepository': { getSettingsLocal: async () => settings, saveSettingsFromSync: async () => {} },
    '@/src/local/syncMetadataRepository': { getSyncMetadata: async () => ({}), saveSyncMetadata: async () => {} },
    '@/src/local/localMode': { getLocalMode: async () => localMode },
    './syncMerge': { mergeSyncRecords }, './syncProgress': progress, './syncTask': { createSyncTask },
    './supabaseClient': {
      isSupabaseConfigured: () => true,
      getCurrentSession: async () => { sessionReads++; return session; },
      getSupabaseClient: () => client,
    },
  });
  return { ...exports, requests: () => requests, sessionReads: () => sessionReads };
}

test('real sync entry: local mode skips all account and network access', async () => {
  const sync = pipeline({ localMode: true });
  assert.equal((await sync.runManualSync()).status, 'localMode');
  assert.equal(sync.requests(), 0);
  assert.equal(sync.sessionReads(), 0);
});

test('real sync entry: signed-out mode performs no cloud requests', async () => {
  const sync = pipeline({ session: null });
  assert.equal((await sync.runManualSync()).status, 'signedOut');
  assert.equal(sync.requests(), 0);
});

test('real sync entry: automatic/manual share one full pipeline, and logout drain waits for it', async () => {
  const gate = deferred();
  const sync = pipeline({ gate });
  const automatic = sync.runManualSync();
  const seen = [];
  const manual = sync.runManualSync({ onProgress: (value) => seen.push(value.percent) });
  assert.equal(automatic, manual);
  let drained = false;
  const drain = sync.waitForRunningSync().then(() => { drained = true; });
  await flush();
  assert.equal(drained, false);
  assert.equal(sync.sessionReads(), 1);
  gate.resolve();
  assert.equal((await automatic).status, 'synced');
  await drain;
  assert.equal(drained, true);
  assert.equal(sync.requests(), 4, 'one projects pull, one issues pull, two settings pulls');
  assert.equal(seen.at(-1), 100);
});

test('settings edited during synchronization remain pending instead of reverting', async () => {
  const snapshot = { updated_at: 'old', sync_status: 'pending', theme_primary_color: '#111111' };
  let stored = { ...snapshot, updated_at: 'new', theme_primary_color: '#222222' };
  let writes = 0;
  const settings = loadModule('../src/local/settingsRepository.ts', {
    './keys': { localKeys: { settings: 'settings' } },
    './storage': { getJson: async () => stored, setJson: async (_key, value) => { writes++; stored = value; } },
  });
  const expected = settings.normalizeIssueSettings(snapshot);
  stored = settings.normalizeIssueSettings(stored);
  await settings.saveSettingsFromSync(snapshot, expected);
  assert.equal(writes, 0);
  assert.equal(stored.theme_primary_color, '#222222');
  assert.equal(stored.sync_status, 'pending');
});

test('fresh install can persist downloaded settings without treating generated defaults as edits', async () => {
  let stored = null;
  const settings = loadModule('../src/local/settingsRepository.ts', {
    './keys': { localKeys: { settings: 'settings' } },
    './storage': { getJson: async (_key, fallback) => stored ?? fallback, setJson: async (_key, value) => { stored = value; } },
  });
  const snapshot = await settings.getSettingsLocal();
  await settings.saveSettingsFromSync({ ...snapshot, theme_primary_color: '#654321' }, snapshot);
  assert.equal(stored.theme_primary_color, '#654321');
  assert.equal(stored.sync_status, 'synced');
});

test('actual repository writeback preserves local changes and acknowledges only uploaded versions', async () => {
  const snapshot = [{ id: 'edit', title: 'old', sync_status: 'pending', number: 1 }];
  const latest = [{ ...snapshot[0], title: 'edited during pull' }, { id: 'new', title: 'created during pull', sync_status: 'pending', number: 2 }];
  let saved;
  const repository = loadModule('../src/local/repositories/issuesRepository.ts', {
    '@/src/theme': { projectColors: ['#123456'] },
    '../keys': { localKeys: { issues: 'issues', issueProjects: 'projects' } },
    '../settingsRepository': {},
    './localListCache': { updateCachedList: async (_key, update) => { saved = update(latest); } },
    '@/src/sync/syncMerge': { preserveConcurrentChanges },
  });
  await repository.replaceIssuesFromSync([
    ...snapshot,
    { id: 'remote', title: 'from cloud', sync_status: 'synced', number: 3 },
  ], snapshot);
  const result = new Map(saved.map((record) => [record.id, record]));
  assert.equal(result.get('edit').title, 'edited during pull');
  assert.equal(result.get('edit').sync_status, 'pending');
  assert.equal(result.get('new').sync_status, 'pending');
  assert.equal(result.get('remote').sync_status, 'synced');
});

for (const initial of ['inactive', null]) {
  test(`iOS cold start from ${initial} waits for active and then syncs exactly once`, async () => {
    const life = lifecycle({ appState: initial });
    await flush();
    assert.equal(life.calls(), 0);
    life.app('active');
    await flush();
    assert.equal(life.calls(), 1);
    life.app('inactive'); life.app('active');
    await flush();
    assert.equal(life.calls(), 1, 'notification center does not count as reopening');
    life.dispose();
  });
}

test('iOS AutoSync component joins foreground/manual requests and cleans up native listeners', async () => {
  const cleanups = [];
  const gate = deferred();
  let executions = 0, appListener, authListener, modeListener;
  let themeRefreshes = 0, listenersRemoved = 0;
  const task = createSyncTask(async (report) => {
    executions++;
    report(progress.ratioProgress('pull', 0.5));
    await gate.promise;
    return { status: 'synced' };
  });
  const component = loadModule('../src/sync/AutoSync.tsx', {
    react: { useEffect: (effect) => { cleanups.push(effect()); } },
    'react-native': { AppState: {
      currentState: 'inactive',
      addEventListener: (event, listener) => {
        assert.equal(event, 'change');
        appListener = listener;
        return { remove: () => { listenersRemoved++; } };
      },
    } },
    '@/src/local/localMode': { subscribeLocalMode: (listener) => { modeListener = listener; return () => { listenersRemoved++; }; } },
    './autoSyncLifecycle': { startAutoSync },
    './manualSync': { runManualSync: task.run, subscribeSync: task.subscribe },
    '@/src/shared/theme': { useThemeSettings: () => ({ refreshThemeFromSettings: async () => { themeRefreshes++; } }) },
    './supabaseClient': {
      isSupabaseConfigured: () => true,
      getCurrentSession: async () => ({ user: { id: 'ios-user' } }),
      getSupabaseClient: () => ({ auth: { onAuthStateChange: (listener) => {
        authListener = listener;
        return { data: { subscription: { unsubscribe: () => { listenersRemoved++; } } } };
      } } }),
    },
  });
  component.AutoSync();
  await flush();
  assert.equal(executions, 0);
  appListener('active');
  await flush();
  assert.equal(executions, 1);
  authListener('TOKEN_REFRESHED', { user: { id: 'ios-user' } });
  appListener('inactive'); appListener('background'); appListener('inactive'); appListener('active');
  modeListener(false);
  const seen = [];
  const manual = task.run({ onProgress: (value) => seen.push(value.percent) });
  await flush();
  assert.equal(executions, 1);
  assert.equal(seen[0], 50);
  gate.resolve();
  await manual;
  assert.equal(themeRefreshes, 1);
  for (const cleanup of cleanups) cleanup?.();
  assert.equal(listenersRemoved, 3);
});
