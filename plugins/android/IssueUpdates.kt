package __PACKAGE__

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class IssueUpdatePackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(IssueUpdates(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class IssueUpdates(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  private val downloading = AtomicBoolean(false)
  private val cancelled = AtomicBoolean(false)
  private val directory get() = File(context.filesDir, "updates").apply { mkdirs() }
  override fun getName() = "IssueUpdates"
  private fun code(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
  private val signatureFlags get() = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
  private fun installed() = context.packageManager.getPackageInfo(context.packageName, signatureFlags)
  override fun getConstants(): Map<String, Any> = mapOf("versionCode" to code(installed()).toDouble(), "versionName" to (installed().versionName ?: ""))
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
  @ReactMethod fun cancelDownload() { cancelled.set(true) }

  private fun digest(file: File): String {
    val md = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(65536)
      while (true) { val count = input.read(buffer); if (count < 0) break; md.update(buffer, 0, count) }
    }
    return md.digest().joinToString("") { "%02x".format(it) }
  }
  private fun signatures(info: PackageInfo): Set<String> {
    val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
    return signatures?.map { signature -> MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) } }?.toSet() ?: emptySet()
  }
  private fun validate(file: File, expectedVersion: Long) {
    val archive = context.packageManager.getPackageArchiveInfo(file.absolutePath, signatureFlags) ?: error("安装包无法识别，请重新下载")
    require(archive.packageName == context.packageName) { "安装包与当前应用不匹配" }
    require(code(archive) == expectedVersion && expectedVersion > code(installed())) { "安装包版本不匹配，请重新检查更新" }
    val expected = signatures(installed())
    require(expected.isNotEmpty() && signatures(archive) == expected) { "安装包签名不匹配，已停止安装" }
    require((archive.applicationInfo?.minSdkVersion ?: 24) <= Build.VERSION.SDK_INT) { "当前 Android 版本不支持此更新" }
  }
  private fun progress(received: Long, total: Long) {
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("IssueUpdateProgress", Arguments.createMap().apply {
      putDouble("received", received.toDouble()); putDouble("total", total.toDouble())
    })
  }
  @ReactMethod fun download(url: String, sha256: String, bytes: Double, version: Double, promise: Promise) {
    if (!downloading.compareAndSet(false, true)) { promise.reject("BUSY", "正在下载更新"); return }
    cancelled.set(false)
    worker.execute {
      var partial: File? = null
      try {
        val address = URL(url)
        require(address.protocol == "https" && address.host == "updates.qiuzizhao.com" && address.port in listOf(-1, 443) && address.userInfo == null && address.path.startsWith("/issue/releases/")) { "更新下载地址无效" }
        require(sha256.matches(Regex("[a-fA-F0-9]{64}")) && bytes == bytes.toLong().toDouble() && bytes in 1.0..209715200.0 && version == version.toLong().toDouble() && version > code(installed())) { "更新信息无效" }
        val file = File(directory, "Issue-${version.toLong()}.apk")
        if (file.exists() && (file.length() != bytes.toLong() || !digest(file).equals(sha256, true))) file.delete()
        if (!file.exists()) {
          val part = File(directory, "Issue-${version.toLong()}.part")
          partial = part
          val connection = address.openConnection() as javax.net.ssl.HttpsURLConnection
          connection.connectTimeout = 15000; connection.readTimeout = 30000; connection.instanceFollowRedirects = false
          try {
            require(connection.responseCode == 200) { "下载服务暂不可用，请稍后重试" }
            if (connection.contentLengthLong > 0) require(connection.contentLengthLong == bytes.toLong()) { "安装包大小不匹配" }
            connection.inputStream.use { input -> part.outputStream().use { output ->
              val buffer = ByteArray(65536); var received = 0L; var last = 0L
              while (true) {
                if (cancelled.get()) error("下载已取消")
                val count = input.read(buffer); if (count < 0) break
                received += count; require(received <= bytes.toLong()) { "安装包大小不匹配" }; output.write(buffer, 0, count)
                if (System.currentTimeMillis() - last > 200) { progress(received, bytes.toLong()); last = System.currentTimeMillis() }
              }
              require(received == bytes.toLong()) { "下载不完整，请重试" }
            } }
          } finally { connection.disconnect() }
          require(digest(part).equals(sha256, true)) { "安装包校验失败，请重新下载" }
          if (cancelled.get()) error("下载已取消")
          validate(part, version.toLong())
          require(part.renameTo(file)) { "无法保存更新，请检查可用空间" }
        }
        if (cancelled.get()) error("下载已取消")
        validate(file, version.toLong())
        directory.listFiles()?.filter { it != file }?.forEach { it.delete() }
        progress(bytes.toLong(), bytes.toLong()); promise.resolve(null)
      } catch (e: Exception) {
        partial?.delete(); promise.reject(if (cancelled.get()) "CANCELLED" else "DOWNLOAD_FAILED", e.message ?: "下载失败，请稍后重试")
      } finally { downloading.set(false) }
    }
  }
  @ReactMethod fun install(version: Double, promise: Promise) {
    try {
      val file = File(directory, "Issue-${version.toLong()}.apk")
      require(file.exists()) { "请先下载安装包" }; validate(file, version.toLong())
      if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) {
        context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        promise.resolve(false); return
      }
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates.provider", file)
      context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
      promise.resolve(true)
    } catch (e: Exception) { promise.reject("INSTALL_FAILED", e.message ?: "无法打开安装程序") }
  }
}
