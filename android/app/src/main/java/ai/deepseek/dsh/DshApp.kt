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
        const val KEY_MONITORING_ENABLED = "monitoring_enabled"

        const val CRASH_LOG_FILE = "crash.log"
        const val TAG = "DshApp"

        lateinit var instance: DshApp
            private set
    }

    val prefs: SharedPreferences
        get() = getSharedPreferences(PREFS, MODE_PRIVATE)

    /**
     * The configured servers and the one the app opens. Reading it once
     * migrates a pre-multi-server install, in which the single saved hostname
     * keeps its URL and certificate and gains no label.
     */
    val serverBook: ServerBook
        get() {
            val stored = ServerBookCodec.decode(
                prefs.getString(ServerBookCodec.serversKey(), null),
                prefs.getString(ServerBookCodec.activeKey(), null),
            )
            if (stored != null) return stored
            val migrated = migrateLegacyServer()
            saveBook(migrated)
            return migrated
        }

    /** Persist [book] as the configured servers and the active selection. */
    fun saveBook(book: ServerBook) {
        prefs.edit()
            .putString(ServerBookCodec.serversKey(), ServerBookCodec.encode(book))
            .let { if (book.activeId == null) it.remove(ServerBookCodec.activeKey()) else it.putString(ServerBookCodec.activeKey(), book.activeId) }
            .apply()
    }

    /** The server the app opens, or null when none is configured. */
    val activeServer: ServerEntry?
        get() = serverBook.active()

    /**
     * The active server's URL, or null. The setter edits the active entry —
     * adding one when nothing is configured — and is the compatibility seam for
     * the bridge and the native fallback screen.
     */
    var serverUrl: String?
        get() = activeServer?.url
        set(value) {
            val book = serverBook
            val normalized = value?.let { normalizeServerUrl(it) } ?: ""
            if (normalized.isEmpty()) return
            val active = book.active()
            val edited = if (active == null) {
                ServerEdits.add(book, newServerId(), "", normalized)
            } else {
                ServerEdits.update(book, active.id, active.label, normalized)
            }
            when (edited) {
                is ServerEdit.Applied -> saveBook(edited.book)
                is ServerEdit.Rejected -> Log.w(TAG, "server URL rejected: ${edited.reason}")
            }
        }

    /** The active server's remembered certificate alias, or null. */
    var clientCertAlias: String?
        get() = activeServer?.certAlias
        set(value) {
            if (activeServer == null) return
            saveBook(ServerEdits.setCertAlias(serverBook, value))
        }

    /**
     * Add a server to the book.
     * @param label user-facing name; empty is allowed.
     * @param url raw URL; normalized and validated by [ServerEdits.add].
     * @returns the applied book, or the rejection the caller reports.
     */
    fun addServer(label: String, url: String): ServerEdit {
        val edited = ServerEdits.add(serverBook, newServerId(), label, url)
        if (edited is ServerEdit.Applied) saveBook(edited.book)
        return edited
    }

    /**
     * Edit a server's label and URL.
     * @param id entry to edit.
     * @param label replacement name.
     * @param url replacement URL.
     * @returns the applied book, or the rejection the caller reports.
     */
    fun updateServer(id: String, label: String, url: String): ServerEdit {
        val edited = ServerEdits.update(serverBook, id, label, url)
        if (edited is ServerEdit.Applied) saveBook(edited.book)
        return edited
    }

    /**
     * Remove a server.
     * @param id entry to remove.
     * @returns the applied book, or the rejection the caller reports.
     */
    fun removeServer(id: String): ServerEdit {
        val edited = ServerEdits.remove(serverBook, id)
        if (edited is ServerEdit.Applied) saveBook(edited.book)
        return edited
    }

    /**
     * Select the server the app opens.
     * @param id entry to select.
     * @returns the applied book, or the rejection the caller reports.
     */
    fun selectServer(id: String): ServerEdit {
        val edited = ServerEdits.select(serverBook, id)
        if (edited is ServerEdit.Applied) saveBook(edited.book)
        return edited
    }

    /**
     * Read the pre-multi-server preferences into a one-entry book.
     *
     * A legacy install could reach exactly one backend, so there is no
     * collision to resolve and nothing to ask: the stored origin and
     * certificate move onto the entry, and its label stays empty because the
     * old store never had one. The UI shows an empty label as "unset".
     */
    private fun migrateLegacyServer(): ServerBook {
        val legacyUrl = prefs.getString(KEY_SERVER_URL, null)?.let { normalizeServerUrl(it) } ?: ""
        val legacyAlias = prefs.getString(KEY_CERT_ALIAS, null)
        val migrated = ServerMigration.fromLegacy(legacyUrl, legacyAlias, newServerId())
        if (migrated.servers.isNotEmpty()) Log.i(TAG, "migrated the single saved server to the server book")
        return migrated
    }

    /** A fresh opaque server id. */
    private fun newServerId(): String = java.util.UUID.randomUUID().toString()

    /** Background task-completion monitoring opt-out; on by default. */
    var monitoringEnabled: Boolean
        get() = prefs.getBoolean(KEY_MONITORING_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_MONITORING_ENABLED, value).apply()

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
