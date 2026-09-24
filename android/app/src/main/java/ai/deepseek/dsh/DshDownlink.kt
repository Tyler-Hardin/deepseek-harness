package ai.deepseek.dsh

import android.os.Handler
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/**
 * One dsh downlink WebSocket (`/api/events.host` or `/api/events.mux`).
 *
 * dsh treats these sockets as downlink-only: the client never sends a frame
 * (any client message closes the socket with code 1008, "downlink only"),
 * and every pushed message is a full-form `server-request` envelope
 * `{ rpcId, method, payload }` whose payload is a typed frame. Reconnects
 * with exponential backoff; oversized messages (history replay can be
 * enormous) are dropped before parsing, because the monitor needs only the
 * small control frames.
 *
 * All [Listener] callbacks arrive on the monitor [Handler] thread.
 */
class DshDownlink(
    private val name: String,
    private val url: String,
    private val client: OkHttpClient,
    private val handler: Handler,
    private val listener: Listener,
) {

    /** Consumer of one downlink's frames. */
    interface Listener {
        /** One typed frame's payload (a `server-request` payload object). */
        fun onFrame(rpcId: String, payload: JSONObject)

        /** Connection state changed; [connected] is the current state. */
        fun onConnectionStateChanged(connected: Boolean)
    }

    companion object {
        private const val TAG = "DshDownlink"
        /** History replay can carry huge entries; only small control frames matter. */
        private const val MAX_FRAME_CHARS = 256 * 1024
        private const val INITIAL_RECONNECT_MS = 1_000L
        private const val MAX_RECONNECT_MS = 30_000L
    }

    @Volatile
    private var connected = false
    private var webSocket: WebSocket? = null
    private var stopping = false
    private var reconnectDelayMs = INITIAL_RECONNECT_MS
    private val reconnect = Runnable { connect() }

    /** Open (or reopen) the socket. Call from the monitor thread. */
    fun connect() {
        if (stopping || connected) return
        Log.i(TAG, "$name connecting to $url")
        webSocket = client.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                connected = true
                reconnectDelayMs = INITIAL_RECONNECT_MS
                Log.i(TAG, "$name connected")
                handler.post { listener.onConnectionStateChanged(true) }
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.length > MAX_FRAME_CHARS) return
                val root = try {
                    JSONObject(text)
                } catch (e: Exception) {
                    null
                } ?: return
                val payload = root.optJSONObject("payload") ?: return
                handler.post { listener.onFrame(root.optString("rpcId"), payload) }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "$name closed: $code $reason")
                onGone()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "$name failure: ${t.message}")
                onGone()
            }
        })
    }

    private fun onGone() {
        connected = false
        handler.post {
            listener.onConnectionStateChanged(false)
            scheduleReconnect()
        }
    }

    private fun scheduleReconnect() {
        if (stopping) return
        Log.i(TAG, "$name reconnecting in ${reconnectDelayMs}ms")
        handler.postDelayed(reconnect, reconnectDelayMs)
        reconnectDelayMs = (reconnectDelayMs * 2).coerceAtMost(MAX_RECONNECT_MS)
    }

    /** Stop the socket and cancel pending reconnects. Call from the monitor thread. */
    fun stop() {
        stopping = true
        handler.removeCallbacks(reconnect)
        webSocket?.close(1000, "monitoring stopped")
        connected = false
    }

    /** Whether the socket is currently open. */
    fun isConnected(): Boolean = connected
}
