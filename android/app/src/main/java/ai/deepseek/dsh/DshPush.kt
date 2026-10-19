package ai.deepseek.dsh

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.os.Build
import android.provider.Settings
import android.security.KeyChain
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.security.KeyStore
import java.util.concurrent.TimeUnit
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * Firebase Cloud Messaging receiver.
 *
 * The device holds no socket and no foreground service: the Host pushes a
 * message when a Session run finishes, errors, or waits for input, and Google's
 * transport wakes the app. That is the same mechanism chat apps use, and it is
 * why dsh needs no persistent "monitoring" notification on this path.
 */
class DshFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "DshPush"
        /** Alert channel shared with the in-app notification bridge. */
        const val CHANNEL_ALERTS = DshJsBridge.CHANNEL_ID
        const val NOTIFY_ID = 2
    }

    /** A rotated registration token: register it so the Host can keep pushing. */
    override fun onNewToken(token: String) {
        DshDiagnostics.record(TAG, "FCM token: $token")
        Log.i(TAG, "FCM token: $token")
        DshPush.registerAsync(applicationContext, token)
    }

    /** One Host push: `kind` picks the localized copy, the Host sends no prose. */
    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val sessionTitle = data["sessionLabel"].takeUnless { it.isNullOrEmpty() }
            ?: getString(R.string.push_session_fallback)
        val title = when (data["kind"]) {
            "finished" -> getString(R.string.push_finished_title)
            "error" -> getString(R.string.push_error_title)
            "approval" -> getString(R.string.push_approval_title)
            "question" -> getString(R.string.push_question_title)
            else -> getString(R.string.push_default_title)
        }
        val body = when (data["kind"]) {
            "finished", "error", "approval", "question" -> sessionTitle
            else -> getString(R.string.push_default_body)
        }
        val sessionId = data["sessionId"].orEmpty()
        DshDiagnostics.record(TAG, "push received: ${data["kind"] ?: "message"} session=${sessionId.take(8)}")
        createChannel()
        if (DshNotificationService.activityForeground) {
            DshDiagnostics.record(TAG, "push suppressed while the activity is foreground: ${data["kind"] ?: "message"}")
            return
        }
        val openIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (sessionId.isNotEmpty()) putExtra(DeepLinkExtras.SESSION_ID, sessionId)
            data["origin"]?.takeUnless { it.isNullOrEmpty() }
                ?.let { putExtra(DeepLinkExtras.ORIGIN, it) }
        }
        val pending = PendingIntent.getActivity(
            this, 0, openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ALERTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pending)
            .setVibrate(longArrayOf(0, 200, 100, 200))
            .build()
        NotificationManagerCompat.from(this).notify(NOTIFY_ID, notification)
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        for (legacy in DshJsBridge.LEGACY_CHANNEL_IDS) nm.deleteNotificationChannel(legacy)
        if (nm.getNotificationChannel(CHANNEL_ALERTS) != null) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ALERTS, getString(R.string.push_channel_name), NotificationManager.IMPORTANCE_HIGH).apply {
                description = getString(R.string.push_channel_desc)
                setSound(
                    Settings.System.DEFAULT_NOTIFICATION_URI,
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                enableVibration(true)
            }
        )
    }
}

/** Registers this device's push token with the active dsh server. */
object DshPush {

    private const val TAG = "DshPush"
    private val media = "application/json; charset=utf-8".toMediaType()

    /** Current token, fetched if it is not cached yet. */
    fun token(application: Context): String? = FirebaseMessaging.getInstance().token
        .let { task ->
            try {
                com.google.android.gms.tasks.Tasks.await(task, 10, TimeUnit.SECONDS)
            } catch (error: Exception) {
                DshDiagnostics.record(TAG, "FCM token unavailable: ${error.message}")
                null
            }
        }

    /**
     * Fetch the token, then register it with every configured server.
     *
     * The token identifies this install, not a deployment: each server keeps its
     * own copy so a server can push while another one is active, and the
     * per-server certificate proves the same identity to each.
     */
    fun registerAsync(context: Context, token: String? = null) {
        Thread({
            val value = token ?: this.token(context) ?: return@Thread
            for (server in DshApp.instance.serverBook.servers) {
                val alias = server.certAlias ?: continue
                register(context, server.url, alias, value)
            }
        }, "dsh-push-register").start()
    }

    /** POST the token to one server through its own mTLS identity. */
    private fun register(context: Context, serverUrl: String, alias: String, token: String) {
        val client = mtlsClient(context, alias) ?: return
        val body = JSONObject().put("token", token).toString()
        val request = Request.Builder()
            .url(serverUrl.trimEnd('/') + "/push/register")
            .post(body.toRequestBody(media))
            .build()
        try {
            client.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                val ok = try { JSONObject(text).optBoolean("ok") } catch (error: Exception) { false }
                DshDiagnostics.record(TAG, "push.register $serverUrl ${if (ok) "ok" else "failed: ${text.take(160)}"}")
            }
        } catch (error: Exception) {
            DshDiagnostics.record(TAG, "push.register $serverUrl failed: ${error.message}")
        }
    }

    /** OkHttp client presenting the remembered mTLS certificate, or null. */
    private fun mtlsClient(context: Context, alias: String): OkHttpClient? = try {
        val privateKey = KeyChain.getPrivateKey(context, alias)
        val chain = KeyChain.getCertificateChain(context, alias)
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
        OkHttpClient.Builder()
            .sslSocketFactory(sslContext.socketFactory, tmf.trustManagers.first() as X509TrustManager)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    } catch (error: Exception) {
        DshDiagnostics.record(TAG, "mTLS client failed: ${error.message}")
        null
    }
}
