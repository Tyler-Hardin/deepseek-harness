package ai.deepseek.dsh

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.security.KeyChain
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.security.KeyStore
import java.util.UUID
import java.util.concurrent.TimeUnit
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * Foreground service that monitors dsh sessions for completion.
 *
 * Opens the two dsh downlink WebSockets (`/api/events.host` and
 * `/api/events.mux`) with the same mTLS client certificate the WebView uses,
 * and posts a native notification when a session run finishes, errors, or
 * pauses waiting for user input — but only while the app is not in the
 * foreground (in-app UI already shows those states).
 *
 * Delivery is deliberately independent of the WebView: the sockets are
 * downlink-only watch streams (the client never sends a frame), so this
 * service keeps working while the page is backgrounded, suspended, or gone.
 * The persistent monitoring notification is the visible proof that the
 * connection is alive; its text mirrors the connection state, so a dead
 * monitor is never silent. Modeled on the goop app's notification service,
 * adapted to the dsh wire contract (see android/.phase0 notes).
 */
class DshNotificationService : Service() {

    companion object {
        private const val TAG = "DshNotifySvc"

        private const val CHANNEL_MONITORING = "dsh_monitoring"
        private const val CHANNEL_ALERTS = "dsh_task_alerts"

        private const val NOTIFY_MONITORING = 100

        private const val ACTION_STOP = "ai.deepseek.dsh.STOP_MONITORING"

        /** Debounce for the running→idle edge: swallows maintenance blips between queued turns. */
        private const val FINISH_DEBOUNCE_MS = 4_000L

        /** Wake-lock window; refreshed on traffic and by the watchdog while monitoring is active. */
        private const val WAKE_LOCK_WINDOW_MS = 10 * 60 * 1_000L
        private const val WATCHDOG_INTERVAL_MS = 9 * 60 * 1_000L

        private const val RECONNECT_RETRY_MS = 15_000L

        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

        /**
         * Whether the activity is currently visible; decides whether alerts
         * ring (the in-app UI already shows completion while the app is open).
         */
        @Volatile
        var activityForeground = true
    }

    // ── Monitor thread: every mutable bit of classifier and socket state lives here. ──

    private var monitorThread: HandlerThread? = null
    private var monitor: Handler? = null
    private var hostSocket: DshDownlink? = null
    private var muxSocket: DshDownlink? = null
    private var httpClient: OkHttpClient? = null
    private var monitorActive = false
    private var certError = false
    private var needReconcile = false

    private class SessionWatch {
        var running = false
        /** Outstanding interaction ids (question rpcId / approval id) awaiting resolution. */
        val pending = mutableSetOf<String>()
        /** Interaction ids already announced with a notification (replay must not ring twice). */
        val interactionAlerted = mutableSetOf<String>()
        var hadError = false
        /** Finished-debounce callback, cancelled by a re-run or removal. */
        var pendingFinish: Runnable? = null
        /** Display title: durable projection title, cwd basename, then a short id. */
        var title: String? = null
        /** Non-null for subagent children, whose completions must not ring. */
        var parentSessionId: String? = null
        /** Blank sessions never run and never ring. */
        var blank = false
    }

    private val sessions = LinkedHashMap<String, SessionWatch>()
    private val lostWhileRunning = mutableSetOf<String>()

    private var wakeLock: PowerManager.WakeLock? = null
    private val watchdog = object : Runnable {
        override fun run() {
            refreshWakeLock()
            monitor?.postDelayed(this, WATCHDOG_INTERVAL_MS)
        }
    }

    // ── Service lifecycle ─────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createChannels()
        val thread = HandlerThread("dsh-monitor").apply { start() }
        monitorThread = thread
        monitor = Handler(thread.looper)
        Log.i(TAG, "service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Log.i(TAG, "stop action received")
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        try {
            startForeground(NOTIFY_MONITORING, buildMonitoringNotification())
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed: ${e.message}", e)
            stopSelf()
            return START_NOT_STICKY
        }
        monitor?.post { startMonitor() }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.i(TAG, "service destroyed")
        monitor?.post {
            monitorActive = false
            monitor?.removeCallbacks(watchdog)
            hostSocket?.stop()
            muxSocket?.stop()
            hostSocket = null
            muxSocket = null
            httpClient = null
            releaseWakeLock()
        }
        monitorThread?.quitSafely()
        super.onDestroy()
    }

    // ── Monitor startup / restart ─────────────────────────────────────

    /** Connect (or reconnect) the downlinks. Runs on the monitor thread. */
    private fun startMonitor() {
        val handler = monitor ?: return
        // Re-entry (server URL / certificate changed): tear down first.
        hostSocket?.stop()
        muxSocket?.stop()
        hostSocket = null
        muxSocket = null
        httpClient = null
        certError = false

        val serverUrl = DshApp.instance.serverUrl
        if (serverUrl == null) {
            DshDiagnostics.record(TAG, "no server URL — monitor idle")
            updatePersistentNotification()
            return
        }
        val alias = DshApp.instance.clientCertAlias

        val client = if (alias == null) {
            plainClient()
        } else {
            try {
                mtlsClient(DshApp.instance, alias)
            } catch (e: Exception) {
                Log.e(TAG, "mTLS client build failed: ${e.message}", e)
                DshDiagnostics.record(TAG, "monitor mTLS build failed: ${e.message}")
                certError = true
                updatePersistentNotification()
                handler.postDelayed({ startMonitor() }, RECONNECT_RETRY_MS)
                return
            }
        }
        httpClient = client
        monitorActive = true
        acquireWakeLock()

        val wsBase = serverUrl
            .replace("https://", "wss://")
            .replace("http://", "ws://")
            .trimEnd('/')
        hostSocket = DshDownlink("host", "$wsBase/api/events.host", client, handler, hostListener())
        muxSocket = DshDownlink("mux", "$wsBase/api/events.mux", client, handler, muxListener())
        hostSocket?.connect()
        muxSocket?.connect()
        handler.removeCallbacks(watchdog)
        handler.post(watchdog)
        updatePersistentNotification()
    }

    // ── Downlink listeners ────────────────────────────────────────────

    private fun hostListener() = object : DshDownlink.Listener {
        override fun onFrame(rpcId: String, payload: JSONObject) {
            handleHostFrame(payload)
        }

        override fun onConnectionStateChanged(connected: Boolean) {
            if (connected) {
                // Host frames fire only on transitions; a connect carries no
                // baseline, so re-pull session.list and reconcile.
                needReconcile = true
                refreshWakeLock()
                postSessionList()
            } else {
                // Snapshot what was running so a post-reconnect seed can ring
                // for completions that happened while the link was down.
                for ((id, watch) in sessions) {
                    if (watch.running) lostWhileRunning.add(id)
                }
            }
            updatePersistentNotification()
        }
    }

    private fun muxListener() = object : DshDownlink.Listener {
        override fun onFrame(rpcId: String, payload: JSONObject) {
            handleMuxFrame(rpcId, payload)
        }

        override fun onConnectionStateChanged(connected: Boolean) {
            updatePersistentNotification()
        }
    }

    // ── Host frames ───────────────────────────────────────────────────

    private fun handleHostFrame(payload: JSONObject) {
        refreshWakeLock()
        val sessionId = payload.optString("sessionId")
        if (sessionId.isEmpty()) return
        when (payload.optString("type")) {
            "host/session-status" -> onSessionStatus(sessionId, payload.optBoolean("running", false))
            "host/session-added" -> {
                val watch = session(sessionId)
                watch.blank = payload.optBoolean("blank", false)
                watch.parentSessionId = payload.optString("parentSessionId").takeIf { it.isNotEmpty() }
                updateTitle(watch, payload)
            }
            "host/session-removed" -> {
                cancelPendingFinish(sessionId)
                sessions.remove(sessionId)
            }
            "host/agent-error" -> {
                session(sessionId).hadError = true
                DshDiagnostics.record(TAG, "agent error in $sessionId: ${payload.optString("message")}")
            }
        }
    }

    private fun onSessionStatus(sessionId: String, running: Boolean) {
        val watch = session(sessionId)
        if (running) {
            watch.running = true
            watch.hadError = false
            lostWhileRunning.remove(sessionId)
            cancelPendingFinish(sessionId)
        } else if (watch.running) {
            watch.running = false
            lostWhileRunning.remove(sessionId)
            if (watch.pending.isEmpty() && !watch.isChild) {
                scheduleFinished(sessionId)
            }
            // A run ending while a question/approval is outstanding is not a
            // completion; the interaction notification already rang.
        }
    }

    private fun scheduleFinished(sessionId: String) {
        val watch = sessions[sessionId] ?: return
        val handler = monitor ?: return
        cancelPendingFinish(sessionId)
        val runnable = Runnable { fireFinished(sessionId) }
        watch.pendingFinish = runnable
        handler.postDelayed(runnable, FINISH_DEBOUNCE_MS)
    }

    private fun cancelPendingFinish(sessionId: String) {
        val watch = sessions[sessionId] ?: return
        val pending = watch.pendingFinish ?: return
        watch.pendingFinish = null
        monitor?.removeCallbacks(pending)
    }

    private fun fireFinished(sessionId: String) {
        val watch = sessions[sessionId] ?: return
        watch.pendingFinish = null
        if (watch.running || watch.pending.isNotEmpty() || activityForeground || watch.isChild) return
        val name = watch.displayName(sessionId)
        if (watch.hadError) {
            notifyAlert(sessionId, getString(R.string.alert_error_title), getString(R.string.alert_error_body, name))
            DshDiagnostics.record(TAG, "alert (error): $sessionId")
        } else {
            notifyAlert(sessionId, getString(R.string.alert_finished_title), getString(R.string.alert_finished_body, name))
            DshDiagnostics.record(TAG, "alert (finished): $sessionId")
        }
    }

    // ── Mux frames (interactions) ─────────────────────────────────────

    private fun handleMuxFrame(rpcId: String, payload: JSONObject) {
        refreshWakeLock()
        val sessionId = payload.optString("sessionId")
        if (sessionId.isEmpty()) return
        when (payload.optString("type")) {
            "question/requested" -> onInteractionRequested(sessionId, rpcId)
            "approval/requested" -> onInteractionRequested(sessionId, payload.optString("approvalId"))
            "question/resolved" -> pendingRemove(sessionId, payload.optString("questionRpcId"))
            "approval/resolved" -> pendingRemove(sessionId, payload.optString("approvalId"))
        }
    }

    private fun onInteractionRequested(sessionId: String, interactionId: String) {
        if (interactionId.isEmpty()) return
        val watch = session(sessionId)
        if (watch.isChild) return
        watch.pending.add(interactionId)
        announceInteraction(sessionId, watch, interactionId)
    }

    /** Ring "needs your input" once per interaction, and only while not foreground. */
    private fun announceInteraction(sessionId: String, watch: SessionWatch, interactionId: String) {
        if (!watch.running || activityForeground) return
        if (!watch.interactionAlerted.add(interactionId)) return
        DshDiagnostics.record(TAG, "interaction requested: $sessionId ($interactionId)")
        val name = watch.displayName(sessionId)
        notifyAlert(sessionId, getString(R.string.alert_needs_input_title), getString(R.string.alert_needs_input_body, name))
    }

    private fun pendingRemove(sessionId: String, interactionId: String) {
        if (interactionId.isEmpty()) return
        val watch = sessions[sessionId] ?: return
        watch.pending.remove(interactionId)
        watch.interactionAlerted.remove(interactionId)
    }

    // ── session.list seed ─────────────────────────────────────────────

    private fun postSessionList() {
        val client = httpClient ?: return
        val serverUrl = DshApp.instance.serverUrl ?: return
        val request = Request.Builder()
            .url(serverUrl.trimEnd('/') + "/api/session.list")
            .post(seedBody().toRequestBody(JSON_MEDIA))
            .build()
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.w(TAG, "session.list failed: ${e.message}")
                DshDiagnostics.record(TAG, "session.list failed: ${e.message}")
            }

            override fun onResponse(call: Call, response: Response) {
                val body = response.body?.string()
                response.close()
                val items = parseSeedItems(body)
                monitor?.post {
                    applySeed(items)
                    updatePersistentNotification()
                }
            }
        })
    }

    private fun parseSeedItems(body: String?): JSONArray? {
        return try {
            val result = JSONObject(body ?: "").optJSONObject("result") ?: return null
            if (!result.optBoolean("ok", false)) return null
            result.optJSONObject("value")?.optJSONArray("items")
        } catch (e: Exception) {
            Log.w(TAG, "session.list parse failed: ${e.message}")
            null
        }
    }

    private fun applySeed(items: JSONArray?) {
        if (items == null) return
        val seen = mutableSetOf<String>()
        for (i in 0 until items.length()) {
            val item = items.optJSONObject(i) ?: continue
            val id = item.optString("sessionId")
            if (id.isEmpty()) continue
            seen.add(id)
            val watch = session(id)
            watch.blank = item.optBoolean("blank", false)
            watch.parentSessionId = item.optString("parentSessionId").takeIf { it.isNotEmpty() }
            val projections = item.optJSONObject("projections")
            val title = projections?.optString("title")
            watch.title = title?.takeIf { it.isNotEmpty() } ?: displayTitleFromCwd(item.optString("cwd"))
            val seedRunning = item.optBoolean("running", false)
            if (needReconcile && watch.running && !seedRunning && watch.pending.isEmpty()) {
                // Finished while the connection was down.
                if (!watch.isChild) scheduleFinished(id)
            }
            watch.running = seedRunning
            // A monitor that connected mid-question replays the pending
            // interaction before it knows the session is running; announce
            // any that are now known to belong to a live run.
            if (seedRunning) {
                for (interactionId in watch.pending.toList()) {
                    announceInteraction(id, watch, interactionId)
                }
            }
        }
        if (needReconcile) {
            for (id in sessions.keys.filter { !seen.contains(it) }) {
                val watch = sessions[id] ?: continue
                cancelPendingFinish(id)
                // Vanished while the link was down: if it was running and the
                // seed no longer lists it, the run ended during the outage.
                if (watch.running && !watch.isChild && watch.pending.isEmpty() && !activityForeground) {
                    val name = watch.displayName(id)
                    if (watch.hadError) {
                        notifyAlert(id, getString(R.string.alert_error_title), getString(R.string.alert_error_body, name))
                    } else {
                        notifyAlert(id, getString(R.string.alert_finished_title), getString(R.string.alert_finished_body, name))
                    }
                    DshDiagnostics.record(TAG, "alert (finished while offline): $id")
                }
                sessions.remove(id)
            }
            lostWhileRunning.clear()
        }
        needReconcile = false
    }

    // ── State helpers ─────────────────────────────────────────────────

    private fun session(sessionId: String): SessionWatch =
        sessions.getOrPut(sessionId) { SessionWatch() }

    private fun updateTitle(watch: SessionWatch, payload: JSONObject) {
        val cwd = payload.optString("cwd").takeIf { it.isNotEmpty() }
        if (cwd != null || watch.title == null) {
            watch.title = if (cwd != null) displayTitleFromCwd(cwd) else null
        }
    }

    private fun displayTitleFromCwd(cwd: String): String? {
        val trimmed = cwd.trimEnd('/', '\\')
        if (trimmed.isEmpty()) return null
        val base = trimmed.substringAfterLast('/').substringAfterLast('\\')
        return base.ifEmpty { null }
    }

    private fun SessionWatch.displayName(sessionId: String): String {
        val title = title
        if (!title.isNullOrEmpty()) return title
        return if (sessionId.length > 8) sessionId.take(8) + "…" else sessionId
    }

    private val SessionWatch.isChild: Boolean
        get() = parentSessionId != null || blank

    // ── Notifications ─────────────────────────────────────────────────

    private fun notifyAlert(sessionId: String, title: String, body: String) {
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingOpen = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingOpen)
            .setVibrate(longArrayOf(0, 200, 100, 200))
            .build()
        NotificationManagerCompat.from(this).notify(sessionId.hashCode() and 0x7fffffff, notification)
    }

    private fun buildMonitoringNotification(): Notification {
        val text = when {
            certError -> getString(R.string.monitoring_cert_error)
            (hostSocket?.isConnected() == true) && (muxSocket?.isConnected() == true) ->
                getString(R.string.monitoring_connected)
            monitorActive -> getString(R.string.monitoring_retrying)
            else -> getString(R.string.monitoring_connecting)
        }
        val stopIntent = Intent(this, DshNotificationService::class.java).apply { action = ACTION_STOP }
        val stopPending = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPending = PendingIntent.getActivity(
            this, 2, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_MONITORING)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(getString(R.string.monitoring_title))
            .setContentText(text)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openPending)
            .addAction(0, getString(R.string.monitoring_stop), stopPending)
            .build()
    }

    /** Refresh the foreground-service notification with the current connection text. */
    private fun updatePersistentNotification() {
        NotificationManagerCompat.from(this).notify(NOTIFY_MONITORING, buildMonitoringNotification())
    }

    private fun createChannels() {
        val nm = getSystemService(NotificationManager::class.java)
        val bell = Uri.parse("android.resource://${packageName}/${R.raw.notification_bell}")
        val bellAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        if (nm.getNotificationChannel(CHANNEL_MONITORING) == null) {
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_MONITORING,
                    getString(R.string.monitoring_channel_name),
                    NotificationManager.IMPORTANCE_MIN
                ).apply {
                    description = getString(R.string.monitoring_channel_desc)
                    setShowBadge(false)
                }
            )
        }
        // Delete and recreate so existing installs pick up the sound on the channel.
        nm.deleteNotificationChannel(CHANNEL_ALERTS)
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ALERTS,
                getString(R.string.alerts_channel_name),
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = getString(R.string.alerts_channel_desc)
                setSound(bell, bellAttrs)
                enableVibration(true)
            }
        )
    }

    // ── Wake lock ─────────────────────────────────────────────────────

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dsh:monitor")
        }
        wakeLock?.let { lock ->
            if (!lock.isHeld) lock.acquire(WAKE_LOCK_WINDOW_MS)
            else lock.acquire(WAKE_LOCK_WINDOW_MS) // refresh the timeout
        }
    }

    private fun refreshWakeLock() {
        if (monitorActive) acquireWakeLock()
    }

    private fun releaseWakeLock() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    // ── HTTP plumbing ─────────────────────────────────────────────────

    private fun plainClient(): OkHttpClient = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    /**
     * Build an OkHttpClient presenting the remembered KeyChain client
     * certificate. KeyChain lookups are synchronous and blocking — this must
     * run off the main thread (enforced on Android 16+).
     */
    private fun mtlsClient(app: DshApp, alias: String): OkHttpClient {
        val privateKey = KeyChain.getPrivateKey(app, alias)
            ?: throw IllegalStateException("KeyChain: no private key for alias '$alias'")
        val chain = KeyChain.getCertificateChain(app, alias)
            ?: throw IllegalStateException("KeyChain: no certificate chain for alias '$alias'")
        val keyStore = KeyStore.getInstance("PKCS12").apply {
            load(null, null)
            setKeyEntry(alias, privateKey, null, chain)
        }
        val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
            .apply { init(keyStore, null) }
        val tmf = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
            .apply { init(null as KeyStore?) }
        val sslContext = SSLContext.getInstance("TLS").apply {
            init(kmf.keyManagers, tmf.trustManagers, null)
        }
        return OkHttpClient.Builder()
            .sslSocketFactory(sslContext.socketFactory, tmf.trustManagers.first() as X509TrustManager)
            .pingInterval(30, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()
    }

    private fun seedBody(): String = JSONObject()
        .put("type", "client-request")
        .put("rpcId", UUID.randomUUID().toString())
        .put("method", "session.list")
        .put("payload", JSONObject())
        .toString()
}
