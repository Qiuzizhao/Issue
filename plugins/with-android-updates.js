const { withAndroidManifest, withMainApplication, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = function withAndroidUpdates(config) {
  config = withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    app.provider ??= [];
    if (!app.provider.some((p) => p.$['android:authorities'] === '${applicationId}.updates.provider')) {
      app.provider.push({ $: { 'android:name': 'androidx.core.content.FileProvider', 'android:authorities': '${applicationId}.updates.provider', 'android:exported': 'false', 'android:grantUriPermissions': 'true' }, 'meta-data': [{ $: { 'android:name': 'android.support.FILE_PROVIDER_PATHS', 'android:resource': '@xml/issue_update_paths' } }] });
    }
    return config;
  });
  config = withMainApplication(config, (config) => {
    if (!config.modResults.contents.includes('add(IssueUpdatePackage())')) {
      config.modResults.contents = config.modResults.contents.replace('PackageList(this).packages.apply {', 'PackageList(this).packages.apply {\n              add(IssueUpdatePackage())');
    }
    return config;
  });
  return withDangerousMod(config, ['android', async (config) => {
    const pkg = config.android.package;
    const base = path.join(config.modRequest.platformProjectRoot, 'app/src/main');
    const target = path.join(base, 'java', ...pkg.split('.'));
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'IssueUpdates.kt'), (await fs.readFile(path.join(__dirname, 'android/IssueUpdates.kt'), 'utf8')).replace('__PACKAGE__', pkg));
    await fs.mkdir(path.join(base, 'res/xml'), { recursive: true });
    await fs.writeFile(path.join(base, 'res/xml/issue_update_paths.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<paths><files-path name="issue_updates" path="updates/" /></paths>\n');
    return config;
  }]);
};
