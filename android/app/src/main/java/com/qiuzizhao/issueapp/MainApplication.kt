package com.qiuzizhao.issueapp

import android.content.Context

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

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

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(IssueUpdatePackage())
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
