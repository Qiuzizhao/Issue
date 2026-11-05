package com.qiuzizhao.issueapp

import android.content.Context
import android.content.res.Configuration
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  /**
   * 统一应用显示密度及字号上限（由 plugins/with-android-display-density.js 注入）。
   */
  override fun attachBaseContext(newBase: Context) {
    // Override only density/font scale so rotation, keyboard and window insets stay dynamic.
    val configuration = Configuration()
    configuration.fontScale = minOf(newBase.resources.configuration.fontScale, 1f)
    // Issue narrow-phone density adaptation
    // Issue use full display metrics, never split-window bounds
    val displayContext = newBase.applicationContext ?: newBase
    val metrics = android.util.DisplayMetrics()
    metrics.setTo(displayContext.resources.displayMetrics)
    runCatching {
      val manager = displayContext.getSystemService(Context.WINDOW_SERVICE) as android.view.WindowManager
      manager.defaultDisplay.getRealMetrics(metrics)
    }
    val shortSidePx = minOf(metrics.widthPixels, metrics.heightPixels)
    val phone = metrics.density > 0f && shortSidePx / metrics.density < 600f
    // Issue foldable keeps system display density
    val foldable = newBase.packageManager.hasSystemFeature("android.hardware.sensor.hinge_angle")
    if (phone && !foldable && shortSidePx > 0 && metrics.density > 0f && shortSidePx / metrics.density < 390f) {
      val targetDpi = kotlin.math.round(shortSidePx * 160f / 390f).toInt()
      val minimumDpi = kotlin.math.round(metrics.densityDpi * 0.82f).toInt()
      configuration.densityDpi = maxOf(targetDpi, minimumDpi).coerceAtMost(metrics.densityDpi)
    }
    super.attachBaseContext(newBase.createConfigurationContext(configuration))
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
