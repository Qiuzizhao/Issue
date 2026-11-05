const { withMainActivity, withMainApplication } = require("expo/config-plugins");

/**
 * 安卓端把系统字体缩放"上限锁到 1"：
 * - 系统字号调小（fontScale < 1）仍然跟随，满足需要小字的用户；
 * - 系统字号调大（fontScale > 1）不再放大，避免界面被撑爆。
 *
 * 只改 JS 层不够：底部标签栏、原生对话框、TextInput 等是原生/第三方库渲染的，
 * 必须在 Application 和 Activity 使用相同的 Configuration 才能一起生效。
 * 窄屏手机同时适度降低应用显示密度，使固定 dp 的文字、图标、按钮和间距一起适配。
 * 以约 390dp 的短边为目标，缩小幅度最多约 18%；普通宽屏和平板维持原密度。
 *
 * 通过配置插件持久化原生适配，
 * 保证每次 prebuild 都会重新写进 Application 和 Activity。
 */

const METHOD_MARKER = "override fun attachBaseContext(newBase: Context)";
const DENSITY_MARKER = "// Issue narrow-phone density adaptation";
const FOLDABLE_MARKER = "// Issue foldable keeps system display density";
const METRICS_MARKER = "// Issue use full display metrics, never split-window bounds";

const EXTRA_IMPORTS = [
  "import android.content.Context",
  "import android.content.res.Configuration",
].join("\n");

const OVERRIDE = `
  /**
   * 统一应用显示密度及字号上限（由 plugins/with-android-display-density.js 注入）。
   */
  override fun attachBaseContext(newBase: Context) {
    // Override only density/font scale so rotation, keyboard and window insets stay dynamic.
    val configuration = Configuration()
    configuration.fontScale = minOf(newBase.resources.configuration.fontScale, 1f)
    ${DENSITY_MARKER}
    ${METRICS_MARKER}
    val displayContext = newBase.applicationContext ?: newBase
    val metrics = android.util.DisplayMetrics()
    metrics.setTo(displayContext.resources.displayMetrics)
    runCatching {
      val manager = displayContext.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager
      manager.defaultDisplay.getRealMetrics(metrics)
    }
    val shortSidePx = minOf(metrics.widthPixels, metrics.heightPixels)
    val phone = metrics.density > 0f && shortSidePx / metrics.density < 600f
    ${FOLDABLE_MARKER}
    val foldable = newBase.packageManager.hasSystemFeature("android.hardware.sensor.hinge_angle")
    if (phone && !foldable && shortSidePx > 0 && metrics.density > 0f && shortSidePx / metrics.density < 390f) {
      val targetDpi = kotlin.math.round(shortSidePx * 160f / 390f).toInt()
      val minimumDpi = kotlin.math.round(metrics.densityDpi * 0.82f).toInt()
      configuration.densityDpi = maxOf(targetDpi, minimumDpi).coerceAtMost(metrics.densityDpi)
    }
    super.attachBaseContext(newBase.createConfigurationContext(configuration))
  }
`;

function patchKotlinFile(file, className) {
  if (file.language !== "kt") {
    throw new Error(`with-android-display-density 需要 ${className}.kt`);
  }
  if (file.contents.includes(METHOD_MARKER)) {
    if (file.contents.includes(METRICS_MARKER)) return file;
    if (file.contents.includes(DENSITY_MARKER)) {
      const previous = /  override fun attachBaseContext\(newBase: Context\) \{\n    \/\/ Override only density\/font scale[^]*?    super.attachBaseContext\(newBase.createConfigurationContext\(configuration\)\)\n  \}/;
      if (!previous.test(file.contents)) throw new Error(`${className}.kt 的密度适配有自定义修改`);
      file.contents = file.contents.replace(previous, OVERRIDE.trimEnd());
      return file;
    }
    // Upgrade the previous generated font-only override, without replacing custom native code.
    const previousOverride = /  override fun attachBaseContext\(newBase: Context\) \{\s*val configuration = Configuration\(newBase.resources.configuration\)\s*configuration.fontScale = minOf\(configuration.fontScale, 1f\)\s*super.attachBaseContext\(newBase.createConfigurationContext\(configuration\)\)\s*\}/;
    if (!previousOverride.test(file.contents)) {
      throw new Error(`${className}.kt 的 attachBaseContext 有自定义实现，无法自动合并显示适配`);
    }
    file.contents = file.contents.replace(previousOverride, OVERRIDE.trimEnd());
    return file;
  }

  let contents = file.contents;
  const packageMatch = contents.match(/^package\s.+$/m);
  if (!packageMatch) {
    throw new Error(`${className}.kt 中未找到 package 声明`);
  }
  const insertAt = packageMatch.index + packageMatch[0].length;
  const missingImports = EXTRA_IMPORTS.split("\n").filter((line) => !contents.includes(line));
  if (missingImports.length) {
    contents = `${contents.slice(0, insertAt)}\n\n${missingImports.join("\n")}${contents.slice(insertAt)}`;
  }

  const classMatch = contents.match(new RegExp(`^class\\s+${className}[^\\n]*\\{\\n`, "m"));
  if (!classMatch) {
    throw new Error(`${className}.kt 中未找到 class ${className} 声明`);
  }
  const classBodyStart = classMatch.index + classMatch[0].length;
  contents = `${contents.slice(0, classBodyStart)}${OVERRIDE}${contents.slice(classBodyStart)}`;

  file.contents = contents;
  return file;
}

module.exports = function withAndroidDisplayDensity(config) {
  config = withMainApplication(config, (configWithApplication) => {
    configWithApplication.modResults = patchKotlinFile(configWithApplication.modResults, "MainApplication");
    return configWithApplication;
  });
  return withMainActivity(config, (configWithActivity) => {
    configWithActivity.modResults = patchKotlinFile(configWithActivity.modResults, "MainActivity");
    return configWithActivity;
  });
};
module.exports.patchKotlinFile = patchKotlinFile;
