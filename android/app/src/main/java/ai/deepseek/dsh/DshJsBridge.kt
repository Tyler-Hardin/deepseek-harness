package ai.deepseek.dsh

import android.Manifest
import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

/**
 * JavaScript bridge — exposed as `window.DshApp` inside the WebView.
 *
 * The bridge is the platform-neutral contract between the web UI and the
 * native app: the web UI's "App" settings section reads and writes the
 * server hostname, certificate, and diagnostics exclusively through these
 * methods, so a future iOS (or other) client can implement the same
 * `window.DshApp` surface without web-side changes.
 *
 * The web UI can also post a native notification (using the timer bell
 * sound in `res/raw/notification_bell.ogg`) and control the background
 * task-completion monitor ([DshNotificationService], which runs its own
 * downlink sockets and is independent of this WebView).
 */
class DshJsBridge(private val context: Context) {

    companion object {
        const val NAME = "DshApp"
        const val CHANNEL_ID = "dsh_notifications"
        const val CHANNEL_NAME = "dsh notifications"
        private const val TAG = "DshJsBridge"
        private const val NOTIFY_ID = 1
    }

    /**
     * Invoked after a server URL change so the activity can reload the
     * WebView at the new host. Set by [MainActivity].
     */
    var onServerUrlChanged: (() -> Unit)? = null

    /**
     * Invoked when the web UI enables monitoring but Android 13+ has not
     * granted POST_NOTIFICATIONS yet; the activity runs its runtime request.
     * Set by [MainActivity].
     */
    var onMonitoringPermissionNeeded: (() -> Unit)? = null

    /**
     * Run one bridge body, reporting a native failure instead of letting it
     * surface as a JavaScript exception that blanks the App page.
     * @param label bridge method name for the report.
     * @param fallback value the page can render when the body fails.
     * @param block bridge body.
     * @returns the body's value, or [fallback].
     */
    private inline fun <T> guarded(label: String, fallback: T, block: () -> T): T = try {
        block()
    } catch (error: Throwable) {
        Log.e(TAG, "$label failed", error)
        DshDiagnostics.record(TAG, "$label failed: ${error.message}")
        fallback
    }

    // ── Notifications ──────────────────────────────────────────

    /**
     * Post a native notification with the timer bell sound.
     * Called by the web UI, e.g. when a long-running action completes.
     */
    @JavascriptInterface
    fun notify(title: String, body: String) {
        createChannel()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w(TAG, "notify blocked: POST_NOTIFICATIONS not granted")
            DshDiagnostics.record(TAG, "notify blocked (permission) — grant notifications in Android settings")
            return
        }
        val sound = Uri.parse("android.resource://${context.packageName}/${R.raw.notification_bell}")
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setSound(sound)
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFY_ID, notification)
        DshDiagnostics.record(TAG, "notification posted: $title")
    }

    // ── Background task-completion monitoring ─────────────────

    /** Read the background task-completion monitoring opt-out pref. */
    @JavascriptInterface
    fun getMonitoringEnabled(): Boolean = guarded("getMonitoringEnabled", true) { DshApp.instance.monitoringEnabled }

    /**
     * Enable or disable the background task-completion monitor
     * ([DshNotificationService]). Disabling stops the foreground service;
     * enabling starts it once Android has granted POST_NOTIFICATIONS (the
     * activity asks on behalf of the page when the permission is still
     * missing, so an enabled toggle is never a silently dead monitor).
     */
    @JavascriptInterface
    fun setMonitoringEnabled(enabled: Boolean) {
        DshApp.instance.monitoringEnabled = enabled
        DshDiagnostics.record(TAG, "monitoring enabled=$enabled")
        val intent = Intent(context, DshNotificationService::class.java)
        if (enabled) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                Log.i(TAG, "monitoring enabled without POST_NOTIFICATIONS — asking the activity")
                DshDiagnostics.record(TAG, "monitoring enabled but POST_NOTIFICATIONS missing — requesting permission")
                onMonitoringPermissionNeeded?.invoke()
                return
            }
            try {
                context.startForegroundService(intent)
            } catch (e: Exception) {
                Log.w(TAG, "monitor start failed: ${e.message}")
                DshDiagnostics.record(TAG, "monitor start failed: ${e.message}")
            }
        } else {
            context.stopService(intent)
        }
    }

    // ── Servers ────────────────────────────────────────────────

    /**
     * The configured servers and the active selection, as JSON:
     * `{"servers":[{"id","label","url","certAlias","active"}],"activeId"}`.
     */
    @JavascriptInterface
    fun getServers(): String = guarded("getServers", "{\"ok\":false,\"error\":\"failed\"}") { bookJson(DshApp.instance.serverBook) }

    /**
     * Add a server; the first one added becomes active.
     * @param label user-facing name; empty is allowed and shown as "unset".
     * @param url raw URL; normalized and validated natively.
     * @returns [bookJson] on success or `{"ok":false,"error":…}`.
     */
    @JavascriptInterface
    fun addServer(label: String, url: String): String {
        val edited = DshApp.instance.addServer(label, url)
        DshDiagnostics.record(TAG, "addServer ${describe(edited)}")
        // Every configured server needs this install's push token too.
        if (edited is ServerEdit.Applied) DshPush.registerAsync(context)
        return editJson(edited)
    }

    /**
     * Edit a server's label and URL; ids stay stable so selection and the
     * remembered certificate follow the row.
     * @param id entry to edit.
     * @param label replacement name.
     * @param url replacement URL.
     * @returns [bookJson] on success or `{"ok":false,"error":…}`.
     */
    @JavascriptInterface
    fun updateServer(id: String, label: String, url: String): String {
        val edited = DshApp.instance.updateServer(id, label, url)
        DshDiagnostics.record(TAG, "updateServer ${describe(edited)}")
        // Every configured server needs this install's push token too.
        if (edited is ServerEdit.Applied) DshPush.registerAsync(context)
        return editJson(edited)
    }

    /**
     * Remove a server; removing the active one leaves no active selection.
     * @param id entry to remove.
     * @returns [bookJson] on success or `{"ok":false,"error":…}`.
     */
    @JavascriptInterface
    fun removeServer(id: String): String {
        val edited = DshApp.instance.removeServer(id)
        DshDiagnostics.record(TAG, "removeServer ${describe(edited)}")
        return editJson(edited)
    }

    /**
     * Select the server the app opens and reload the page at it.
     * @param id entry to select.
     * @returns [bookJson] on success or `{"ok":false,"error":…}`.
     */
    @JavascriptInterface
    fun selectServer(id: String): String {
        val edited = DshApp.instance.selectServer(id)
        DshDiagnostics.record(TAG, "selectServer ${describe(edited)}")
        // The activity restarts the monitor and reloads at the new origin.
        if (edited is ServerEdit.Applied) onServerUrlChanged?.invoke()
        return editJson(edited)
    }

    /** Return the active server hostname/URL (or empty). */
    @JavascriptInterface
    fun getServerUrl(): String = guarded("getServerUrl", "") { DshApp.instance.serverUrl ?: "" }

    /**
     * Persist a new server hostname/URL from the page, then reload the
     * WebView at the new host.
     */
    @JavascriptInterface
    fun setServerUrl(url: String) {
        val normalized = normalizeServerUrl(url)
        if (normalized.isEmpty() || Uri.parse(normalized).let { it.scheme == null || it.host == null }) {
            Toast.makeText(context, "Invalid server URL", Toast.LENGTH_SHORT).show()
            return
        }
        DshApp.instance.serverUrl = normalized
        DshDiagnostics.record(TAG, "server URL set from page: $normalized")
        Toast.makeText(context, "Server URL saved — reloading", Toast.LENGTH_SHORT).show()
        onServerUrlChanged?.invoke()
    }

    /** JSON for a whole book, including the active marker per entry. */
    private fun bookJson(book: ServerBook): String {
        val servers = org.json.JSONArray()
        for (entry in book.servers) {
            servers.put(org.json.JSONObject().apply {
                put("id", entry.id)
                put("label", entry.label)
                put("url", entry.url)
                put("certAlias", entry.certAlias ?: "")
                put("active", entry.id == book.activeId)
            })
        }
        return org.json.JSONObject().apply {
            put("ok", true)
            put("servers", servers)
            put("activeId", book.activeId ?: "")
        }.toString()
    }

    /** JSON for one edit outcome. */
    private fun editJson(edit: ServerEdit): String = when (edit) {
        is ServerEdit.Applied -> bookJson(edit.book)
        is ServerEdit.Rejected -> org.json.JSONObject().apply {
            put("ok", false)
            put("error", when (edit.reason) {
                ServerRejection.INVALID_URL -> "invalid-url"
                ServerRejection.DUPLICATE_URL -> "duplicate-url"
                ServerRejection.UNKNOWN_ID -> "unknown-id"
                ServerRejection.EMPTY_BOOK -> "empty-book"
            })
        }.toString()
    }

    /** Log-friendly description of an edit. */
    private fun describe(edit: ServerEdit): String = when (edit) {
        is ServerEdit.Applied -> "ok active=${edit.book.activeId ?: "none"} count=${edit.book.servers.size}"
        is ServerEdit.Rejected -> "rejected ${edit.reason}"
    }

    // ── Client certificate (mTLS) ──────────────────────────────

    /** The remembered certificate alias, or "none". */
    @JavascriptInterface
    fun getCertInfo(): String = guarded("getCertInfo", "none") { DshApp.instance.clientCertAlias ?: "none" }

    /** Forget the remembered certificate; the system will ask again on next connect. */
    @JavascriptInterface
    fun forgetCertificate() {
        DshApp.instance.clientCertAlias = null
        DshDiagnostics.record(TAG, "certificate forgotten from page")
    }

    // ── Diagnostics ────────────────────────────────────────────

    /** Recent app/WebView/console events, newest first, one per line. */
    @JavascriptInterface
    fun getDiagnostics(): String = guarded("getDiagnostics", "") { DshDiagnostics.snapshot().asReversed().joinToString("\n") }

    @JavascriptInterface
    fun clearDiagnostics() {
        DshDiagnostics.clear()
        DshDiagnostics.record(TAG, "diagnostics cleared from page")
    }

    /** The on-disk crash log, or empty. */
    @JavascriptInterface
    fun getCrashLog(): String = guarded("getCrashLog", "") { DshApp.instance.readCrashLog() }

    @JavascriptInterface
    fun clearCrashLog() {
        DshApp.instance.clearCrashLog()
        DshDiagnostics.record(TAG, "crash log cleared from page")
    }

    // ── App info and navigation ────────────────────────────────

    /** One-line app state, for embedding in the web UI's own diagnostics. */
    @JavascriptInterface
    fun getAppInfo(): String = guarded("getAppInfo", "dsh (unavailable)") {
        val pkg = context.packageManager.getPackageInfo(context.packageName, 0)
        "dsh ${pkg.versionName} (${pkg.versionCode}) · Android ${Build.VERSION.SDK_INT} · " +
            "${Build.MODEL} · cert=${DshApp.instance.clientCertAlias ?: "none"}"
    }

    /** Open the native fallback screen (server hostname + certificate). */
    @JavascriptInterface
    fun openSettings() {
        val activity = context as? Activity ?: return
        activity.runOnUiThread {
            activity.startActivity(Intent(activity, SettingsActivity::class.java))
        }
    }

    private fun createChannel() {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val sound = Uri.parse("android.resource://${context.packageName}/${R.raw.notification_bell}")
        val channel = NotificationChannel(
            CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications from the dsh web UI"
            setSound(
                sound,
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            enableVibration(true)
        }
        nm.createNotificationChannel(channel)
    }
}
