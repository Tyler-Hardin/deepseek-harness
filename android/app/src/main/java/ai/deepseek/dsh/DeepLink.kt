package ai.deepseek.dsh

import java.net.URI
import java.net.URLEncoder

/** A notification tap that names the Session it announced, and the deployment it came from. */
data class DeepLink(val sessionId: String, val origin: String?)

/** Intent extra names the messaging service fills and the activity reads. */
object DeepLinkExtras {
    const val SESSION_ID = "ai.deepseek.dsh.extra.SESSION_ID"
    const val ORIGIN = "ai.deepseek.dsh.extra.ORIGIN"
}

/**
 * The page address that opens [sessionId] on the server at [base].
 *
 * The web UI reads `?session=` on boot and restores that Conversation, which is
 * how a notification tap lands on the run it announced. Existing query
 * parameters and the fragment are preserved.
 *
 * @param base server URL as configured, with or without a trailing slash.
 * @param sessionId Session the notification referred to.
 * @return the address to load in the WebView.
 */
fun sessionUrl(base: String, sessionId: String): String {
    val trimmed = base.trim()
    val hashAt = trimmed.indexOf('#')
    val withoutHash = if (hashAt >= 0) trimmed.substring(0, hashAt) else trimmed
    val hash = if (hashAt >= 0) trimmed.substring(hashAt) else ""
    val queryAt = withoutHash.indexOf('?')
    val path = (if (queryAt >= 0) withoutHash.substring(0, queryAt) else withoutHash).trimEnd('/') + "/"
    val query = if (queryAt >= 0) withoutHash.substring(queryAt) else ""
    val separator = if (query.isEmpty()) "?" else "&"
    return path + query + separator + "session=" + URLEncoder.encode(sessionId, "UTF-8") + hash
}

/**
 * The configured server a deployment origin names, if the book has it.
 *
 * Two origins match only when scheme, host, and port agree: the same host on a
 * different port is a different deployment.
 *
 * @param book current server book.
 * @param origin absolute deployment origin (`scheme://host[:port]`).
 * @return the matching entry, or null when the book does not know the deployment.
 */
fun serverForOrigin(book: ServerBook, origin: String): ServerEntry? {
    val wanted = parseOrigin(origin) ?: return null
    return book.servers.firstOrNull { entry -> parseOrigin(entry.url) == wanted }
}

private data class Origin(val scheme: String, val host: String, val port: Int)

private fun parseOrigin(url: String): Origin? {
    return try {
        val uri = URI(url.trim().trimEnd('/'))
        val scheme = uri.scheme?.lowercase() ?: return null
        val host = uri.host?.lowercase() ?: return null
        val port = when {
            uri.port >= 0 -> uri.port
            scheme == "https" -> 443
            scheme == "http" -> 80
            else -> return null
        }
        Origin(scheme, host, port)
    } catch (_: Exception) {
        null
    }
}
