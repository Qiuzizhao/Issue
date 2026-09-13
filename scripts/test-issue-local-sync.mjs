import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

function read(path) {
  assert.ok(existsSync(path), `Missing file: ${path}`);
  return readFileSync(path, 'utf8');
}

const types = read('src/features/daily/issues/types.ts');
assert.match(types, /export type SyncStatus/, 'Issue types should expose sync status.');
assert.match(types, /id:\s*string/, 'Issue ids should be stable strings for cross-device sync.');
assert.match(types, /deleted_at\??:\s*string \| null/, 'Issue records should expose tombstones.');

const repo = read('src/local/repositories/issuesRepository.ts');
assert.match(repo, /normalizeIssueProject/, 'Project normalization should exist.');
assert.match(repo, /normalizeIssueItem/, 'Issue normalization should exist.');
assert.match(repo, /listIssueProjectsForSync/, 'Projects should expose sync rows including tombstones.');
assert.match(repo, /listIssuesForSync/, 'Issues should expose sync rows including tombstones.');
assert.match(repo, /deleted_at:\s*now/, 'Deletes should be soft deletes.');
assert.doesNotMatch(repo, /filter\(\(item\) => item\.id !== id\)/, 'Deletes should not hard-remove issue rows.');

const settings = read('src/local/settingsRepository.ts');
assert.match(settings, /defaultThemePrimaryColor = '#E03131'/, 'Default theme should match SuperMe.');
assert.match(settings, /issue_projects_order:\s*\[\]/, 'Default project order should be empty.');
assert.match(settings, /saveSettingsFromSync/, 'Settings should support remote download.');

const merge = read('src/sync/syncMerge.ts');
assert.match(merge, /deleted_at/, 'Merge should consider tombstones.');
assert.match(merge, /changeTimestamp/, 'Merge should use latest edit/delete timestamp.');

console.log('Issue local sync contract verified.');
