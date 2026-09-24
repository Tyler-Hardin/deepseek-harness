package ai.deepseek.dsh

import android.app.Application
import android.content.SharedPreferences
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Application class — owns shared preferences (server URL, remembered client
 * certificate) and the global crash handler.
 *
 * Unlike the goop app, a crash is never only a logcat line: it is appended
 * to an on-disk log and flagged as pending, so the next launch can show a
 * visible dialog. Silent crashes are a class of failure this app is built to
 * avoid.
 */
class DshApp : Application() {

    companion object {
        const val PREFS = "dsh_prefs"
        const val KEY_SERVER_URL = "server_url"
        const val KEY_CERT_ALIAS = "client_cert_alias"
        const val KEY_CRASH_PENDING = "crash_pending"

        const val CRASH_LOG_FILE = "crash.log"
        const val TAG = "DshApp"

        lateinit var instance: DshApp
            private set
    }

    val prefs: SharedPreferences
        get() = getSharedPreferences(PREFS, MODE_PRIVATE)

    var serverUrl: String?
        get() = prefs.getString(KEY_SERVER_URL, null)
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value).apply()

    var clientCertAlias: String?
        get() = prefs.getString(KEY_CERT_ALIAS, null)
        set(value) = prefs.edit()
            .let { if (value == null) it.remove(KEY_CERT_ALIAS) else it.putString(KEY_CERT_ALIAS, value) }
            .apply()

    override fun onCreate() {
        super.onCreate()
        instance = this

        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e(TAG, "uncaught exception in ${thread.name}", throwable)
            try {
                appendCrash(thread, throwable)
                prefs.edit().putBoolean(KEY_CRASH_PENDING, true).apply()
            } catch (e: Exception) {
                Log.e(TAG, "failed to record crash: ${e.message}")
            }
            defaultHandler?.uncaughtException(thread, throwable)
        }
    }

    /** Append one crash entry to the on-disk crash log. */
    private fun appendCrash(thread: Thread, throwable: Throwable) {
        val entry = buildString {
            val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
            append("=== ").append(stamp).append(" [").append(thread.name).append("] ===\n")
            append(Log.getStackTraceString(throwable)).append('\n')
        }
        File(filesDir, CRASH_LOG_FILE).appendText(entry)
    }

    fun readCrashLog(): String = try {
        File(filesDir, CRASH_LOG_FILE).takeIf { it.exists() }?.readText().orEmpty()
    } catch (e: Exception) {
        "read failed: ${e.message}"
    }

    fun clearCrashLog() {
        File(filesDir, CRASH_LOG_FILE).delete()
        prefs.edit().putBoolean(KEY_CRASH_PENDING, false).apply()
    }

    /** Returns and clears the "crashed since last launch" flag. */
    fun consumeCrashPending(): Boolean {
        val pending = prefs.getBoolean(KEY_CRASH_PENDING, false)
        prefs.edit().putBoolean(KEY_CRASH_PENDING, false).apply()
        return pending
    }
}

/**
 * Normalize a user-supplied hostname or URL into a loadable server origin.
 *
 * A bare hostname (or `host:port`) gets `https://` — the deployment is
 * always behind mTLS. Quotes and control characters are stripped so the
 * value is safe to embed in the in-WebView error page.
 */
fun normalizeServerUrl(raw: String): String {
    var s = raw.trim()
        .replace("\n", "").replace("\r", "")
        .replace("'", "").replace("\"", "")
    if (s.isEmpty()) return s
    if (!s.startsWith("http://") && !s.startsWith("https://")) s = "https://$s"
    return s.trimEnd('/')
}
