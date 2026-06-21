package dev.clauderemote.claude_remote

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val channelName = "claude_remote/downloads"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName).setMethodCallHandler { call, result ->
            when (call.method) {
                "enqueue" -> {
                    try {
                        val url = call.argument<String>("url")!!
                        val filename = call.argument<String>("filename") ?: "download"
                        val title = call.argument<String>("title") ?: filename
                        val mime = call.argument<String>("mime")
                        result.success(enqueue(url, filename, title, mime))
                    } catch (e: Exception) {
                        result.error("download_failed", e.message, null)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }

    /** Hand the URL to the system DownloadManager: it streams to the public
     *  Downloads folder, shows a notification, and the user opens it from there
     *  (no in-app install prompt). Auth rides as a ?token query param. */
    private fun enqueue(url: String, filename: String, title: String, mime: String?): Long {
        val request = DownloadManager.Request(Uri.parse(url)).apply {
            setTitle(title)
            setDescription("Saved from Claude Remote")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename)
            setAllowedOverMetered(true)
            setAllowedOverRoaming(true)
            if (!mime.isNullOrEmpty()) setMimeType(mime)
        }
        val dm = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        return dm.enqueue(request)
    }
}
