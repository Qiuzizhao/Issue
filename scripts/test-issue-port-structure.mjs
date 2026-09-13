import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

function read(path) {
  assert.ok(existsSync(path), `Missing file: ${path}`);
  return readFileSync(path, 'utf8');
}

const requiredFiles = [
  'app/_layout.tsx',
  'app/index.tsx',
  'app/settings/index.tsx',
  'app/settings/theme.tsx',
  'app/auth.tsx',
  'src/features/daily/issues/IssueScreen.tsx',
  'src/features/daily/issues/styles.ts',
  'src/features/daily/issues/types.ts',
  'src/features/settings/SettingsScreen.tsx',
  'src/features/settings/ThemeSettingsScreen.tsx',
  'src/features/settings/components/ThemeColorEditor.tsx',
  'src/features/settings/components/colorPalette.ts',
  'src/local/repositories/issuesRepository.ts',
  'src/local/settingsRepository.ts',
  'src/sync/manualSync.ts',
  'src/sync/supabaseClient.ts',
  'docs/supabase-schema.sql',
  'assets/sounds/todo-complete-ding.wav',
];

for (const file of requiredFiles) {
  assert.ok(existsSync(file), `Missing migrated file: ${file}`);
}

const issueScreen = read('src/features/daily/issues/IssueScreen.tsx');
assert.match(issueScreen, /title="Issue"/, 'Issue screen should keep the original title.');
assert.match(issueScreen, /settings-outline/, 'Header should include a left settings button.');
assert.match(issueScreen, /sync-outline/, 'Header should include a right manual sync button.');
assert.match(issueScreen, /runManualSync/, 'Issue screen should call manual sync.');
assert.match(issueScreen, /todo-complete-ding\.wav/, 'Issue completion sound should be preserved.');
assert.match(issueScreen, /编辑项目/, 'Project editor sheet should be preserved.');
assert.match(issueScreen, /编辑 Issue/, 'Issue edit modal should be preserved.');

const repository = read('src/local/repositories/issuesRepository.ts');
assert.match(repository, /normalizeIssueItem/, 'Repository should normalize issue rows.');
assert.match(repository, /listIssuesForSync/, 'Repository should expose issue rows for sync.');
assert.match(repository, /deleted_at:\s*now/, 'Issue delete should create a tombstone.');
assert.doesNotMatch(repository, /enqueueOperation|syncQueue/, 'Standalone repository should not use SuperMe sync queue.');

const settingsRepo = read('src/local/settingsRepository.ts');
assert.match(settingsRepo, /theme_primary_color/, 'Settings should include theme color.');
assert.match(settingsRepo, /issue_projects_order/, 'Settings should include issue project order.');

const manualSync = read('src/sync/manualSync.ts');
assert.match(manualSync, /from\('issue_projects'\)/, 'Manual sync should use issue_projects table.');
assert.match(manualSync, /from\('issue_items'\)/, 'Manual sync should use issue_items table.');
assert.match(manualSync, /from\('issue_settings'\)/, 'Manual sync should use issue_settings table.');

const schema = read('docs/supabase-schema.sql');
assert.match(schema, /public\.issue_projects/, 'Schema should define issue_projects table.');
assert.match(schema, /public\.issue_items/, 'Schema should define issue_items table.');
assert.match(schema, /public\.issue_settings/, 'Schema should define issue_settings table.');

const settingsScreen = read('src/features/settings/SettingsScreen.tsx');
assert.match(settingsScreen, /router\.push\('\/settings\/theme'/, 'Settings should link to theme settings.');
assert.match(settingsScreen, /router\.push\('\/auth'/, 'Settings should link to account settings.');

const themeEditor = read('src/features/settings/components/ThemeColorEditor.tsx');
const colorPalette = read('src/features/settings/components/colorPalette.ts');
assert.match(themeEditor, /当前主题色/, 'Theme page should keep SuperMe theme preview text.');
assert.match(themeEditor, /themeColorSwatch/, 'Theme page should keep SuperMe swatch grid.');
assert.match(colorPalette, /#E03131/, 'Theme palette should include SuperMe preset colors.');
assert.match(colorPalette, /#BC8F8F/, 'Theme palette should include final SuperMe preset color.');

console.log('Standalone Issue port structure verified.');
