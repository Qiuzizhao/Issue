const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    const marker = '// Issue release signing';
    if (!config.modResults.contents.includes(marker)) {
      config.modResults.contents += `
${marker}
def issueSigningFile = new File(System.getProperty('user.home'), '.config/issue/android-signing.properties')
if (issueSigningFile.exists()) {
    def issueSigning = new Properties()
    issueSigningFile.withInputStream { issueSigning.load(it) }
    android.signingConfigs.create('issueRelease') {
        storeFile file(issueSigning.getProperty('storeFile'))
        storePassword issueSigning.getProperty('storePassword')
        keyAlias issueSigning.getProperty('keyAlias')
        keyPassword issueSigning.getProperty('keyPassword')
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.issueRelease
} else {
    android.buildTypes.release.signingConfig = null
    gradle.taskGraph.whenReady { graph ->
        if (graph.allTasks.any { it.project == project && it.name in ['assembleRelease', 'bundleRelease', 'packageRelease'] }) {
            throw new GradleException('Issue release signing missing: ~/.config/issue/android-signing.properties')
        }
    }
}
`;
    }
    return config;
  });
};
