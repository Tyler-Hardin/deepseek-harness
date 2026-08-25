package ai.deepseek.dsh

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * In-memory ring buffer of app and WebView events.
 *
 * The goop app logged failures to logcat only, which is invisible on a
 * phone. This buffer keeps the most recent events addressable from the
 * Settings screen, so connection, certificate, and JavaScript failures can
 * be read on the device itself.
 */
object DshDiagnostics {
    private const val MAX_EVENTS = 200
    private val events = ArrayDeque<String>()
    private val timeFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    fun record(tag: String, message: String) {
        val line = "[${timeFormat.format(Date())}] $tag: $message"
        synchronized(events) {
            events.addLast(line)
            while (events.size > MAX_EVENTS) events.removeFirst()
        }
    }

    fun snapshot(): List<String> = synchronized(events) { events.toList() }

    fun clear() = synchronized(events) { events.clear() }
}
