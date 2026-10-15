const { withXcodeProject } = require('@expo/config-plugins');

module.exports = function withIosReleaseVersion(config) {
  return withXcodeProject(config, (config) => {
    const configurations = config.modResults.pbxXCBuildConfigurationSection();
    for (const configuration of Object.values(configurations)) {
      const settings = configuration?.buildSettings;
      if (settings?.PRODUCT_BUNDLE_IDENTIFIER === config.ios.bundleIdentifier ||
          settings?.PRODUCT_BUNDLE_IDENTIFIER === `"${config.ios.bundleIdentifier}"`) {
        settings.MARKETING_VERSION = config.version;
        settings.CURRENT_PROJECT_VERSION = config.ios.buildNumber;
      }
    }
    return config;
  });
};
