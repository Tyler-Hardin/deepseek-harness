package ai.deepseek.dsh

import org.json.JSONArray
import org.json.JSONObject

/**
 * One configured dsh server the app can open.
 *
 * @property id stable identity; selection, the certificate alias, and the
 * monitor follow it across label and URL edits.
 * @property label user-facing name; empty when the user has not named it.
 * @property url normalized origin without a trailing slash.
 * @property certAlias remembered mTLS certificate alias for this server, or
 * null when none is remembered.
 */
data class ServerEntry(
    val id: String,
    val label: String,
    val url: String,
    val certAlias: String?,
)

/**
 * The configured servers plus which one the app opens.
 *
 * @property servers entries in display order; their URLs are unique.
 * @property activeId id of the server the app opens, or null when none is
 * selected.
 */
data class ServerBook(val servers: List<ServerEntry>, val activeId: String?) {

    /** The server the app opens, or null when the book has no active entry. */
    fun active(): ServerEntry? = servers.firstOrNull { it.id == activeId }

    /** The [ServerEntry] with [id], or null. */
    fun byId(id: String): ServerEntry? = servers.firstOrNull { it.id == id }
}

/** Why a server edit was refused; the UI owns the localized wording. */
enum class ServerRejection { INVALID_URL, DUPLICATE_URL, UNKNOWN_ID, EMPTY_BOOK }

/** Outcome of a server edit. */
sealed interface ServerEdit {
    /** @property book the resulting book, already persisted by the caller. */
    data class Applied(val book: ServerBook) : ServerEdit

    /** @property reason why the edit changed nothing. */
    data class Rejected(val reason: ServerRejection) : ServerEdit
}

/**
 * Pure server-book edits. Every mutation that grows or renames the book goes
 * through these functions, which own the two invariants the UI relies on:
 * a server URL is unique across the book, and ids are stable.
 */
object ServerEdits {

    /**
     * Add a server, refusing a URL another entry already uses.
     * @param book current book.
     * @param id identity the caller minted for the new entry.
     * @param label user-facing name; may be empty.
     * @param url raw user input; normalized here.
     * @param certAlias remembered certificate for the new server, if any.
     * @returns the new book or the rejection.
     */
    fun add(book: ServerBook, id: String, label: String, url: String, certAlias: String? = null): ServerEdit {
        val normalized = normalizeServerUrl(url)
        if (!validServerUrl(normalized)) return ServerEdit.Rejected(ServerRejection.INVALID_URL)
        if (book.servers.any { it.url == normalized }) return ServerEdit.Rejected(ServerRejection.DUPLICATE_URL)
        val entry = ServerEntry(id, label.trim(), normalized, certAlias)
        return ServerEdit.Applied(book.copy(servers = book.servers + entry, activeId = book.activeId ?: id))
    }

    /**
     * Edit an entry's label and URL, refusing a URL another entry uses.
     * @param book current book.
     * @param id entry to edit.
     * @param label replacement name; may be empty.
     * @param url raw replacement URL; normalized here.
     * @returns the new book or the rejection.
     */
    fun update(book: ServerBook, id: String, label: String, url: String): ServerEdit {
        val existing = book.byId(id) ?: return ServerEdit.Rejected(ServerRejection.UNKNOWN_ID)
        val normalized = normalizeServerUrl(url)
        if (!validServerUrl(normalized)) return ServerEdit.Rejected(ServerRejection.INVALID_URL)
        if (book.servers.any { it.id != id && it.url == normalized }) return ServerEdit.Rejected(ServerRejection.DUPLICATE_URL)
        val entry = existing.copy(label = label.trim(), url = normalized)
        return ServerEdit.Applied(book.copy(servers = book.servers.map { if (it.id == id) entry else it }))
    }

    /**
     * Remove an entry; removing the active entry leaves the book with no
     * active server rather than silently opening a different host.
     * @param book current book.
     * @param id entry to remove.
     * @returns the new book or the rejection.
     */
    fun remove(book: ServerBook, id: String): ServerEdit {
        if (book.byId(id) == null) return ServerEdit.Rejected(ServerRejection.UNKNOWN_ID)
        val servers = book.servers.filterNot { it.id == id }
        return ServerEdit.Applied(ServerBook(servers, if (book.activeId == id) null else book.activeId))
    }

    /**
     * Select the server the app opens.
     * @param book current book.
     * @param id entry to select.
     * @returns the new book or the rejection.
     */
    fun select(book: ServerBook, id: String): ServerEdit {
        if (book.byId(id) == null) return ServerEdit.Rejected(ServerRejection.EMPTY_BOOK)
        return ServerEdit.Applied(book.copy(activeId = id))
    }

    /**
     * Set the active entry's remembered certificate alias.
     * @param book current book.
     * @param alias alias to remember, or null to forget it.
     * @returns the new book; unchanged when the book has no active entry.
     */
    fun setCertAlias(book: ServerBook, alias: String?): ServerBook {
        val id = book.activeId ?: return book
        if (book.byId(id) == null) return book
        return book.copy(servers = book.servers.map { if (it.id == id) it.copy(certAlias = alias) else it })
    }
}

/**
 * True when [url] is an absolute http(s) origin the app can load.
 *
 * Deliberately platform-free: the server book is pure Kotlin so its
 * invariants are unit-tested on the JVM, without an Android runtime.
 * @param url normalized candidate.
 * @returns whether the app can open it as a server.
 */
fun validServerUrl(url: String): Boolean {
    if (!url.startsWith("http://") && !url.startsWith("https://")) return false
    val afterScheme = url.substringAfter("://")
    // A second scheme means normalizeServerUrl prefixed a non-http input.
    if (afterScheme.isEmpty() || afterScheme.contains("://")) return false
    val authority = afterScheme.substringBefore('/')
    if (authority.isEmpty() || authority.endsWith(':')) return false
    val host = authority.substringBefore(':')
    val port = authority.substringAfter(':', "")
    return host.isNotEmpty() && !host.contains(' ')
        && (port.isEmpty() || port.all { it.isDigit() })
}

/** Migration of the pre-multi-server single hostname into a server book. */
object ServerMigration {

    /**
     * Build the book a pre-multi-server install migrates to.
     *
     * That install could reach exactly one backend, so nothing can collide and
     * nothing needs asking: the stored origin and certificate move onto one
     * entry, and its label stays empty because the old store never had one. The
     * UI renders an empty label as "unset".
     * @param legacyUrl stored hostname, already normalized by the caller.
     * @param legacyAlias stored certificate alias, or null.
     * @param id identity to mint for the entry.
     * @returns a one-entry book, or an empty book when the stored URL is unusable.
     */
    fun fromLegacy(legacyUrl: String, legacyAlias: String?, id: String): ServerBook {
        if (!validServerUrl(legacyUrl)) return ServerBook(emptyList(), null)
        return ServerBook(
            servers = listOf(ServerEntry(id = id, label = "", url = legacyUrl, certAlias = legacyAlias)),
            activeId = id,
        )
    }
}

/**
 * Read and write the server book in the app's preferences, migrating the
 * pre-multi-server single hostname on first read.
 *
 * The legacy install could hold exactly one backend, so migration has nothing
 * to disambiguate: the entry keeps the working URL and certificate and gains
 * no label, because the label is the one value the old store never had. The UI
 * renders an empty label as "unset".
 */
object ServerBookCodec {

    private const val KEY_SERVERS = "servers_json"
    private const val KEY_ACTIVE = "active_server_id"

    /**
     * Decode a stored book.
     * @param serversJson serialized entries, or null when never written.
     * @param activeId stored active id, or null.
     * @returns the book, or null when nothing has been stored yet.
     */
    fun decode(serversJson: String?, activeId: String?): ServerBook? {
        if (serversJson == null) return null
        return try {
            val array = JSONArray(serversJson)
            val servers = (0 until array.length()).mapNotNull { index ->
                val row = array.optJSONObject(index) ?: return@mapNotNull null
                val id = row.optString("id").takeIf { it.isNotEmpty() } ?: return@mapNotNull null
                val url = normalizeServerUrl(row.optString("url"))
                if (!validServerUrl(url)) return@mapNotNull null
                ServerEntry(
                    id = id,
                    label = row.optString("label"),
                    url = url,
                    certAlias = row.optString("certAlias").takeIf { it.isNotEmpty() && it != "null" },
                )
            }
            ServerBook(servers, activeId?.takeIf { id -> servers.any { it.id == id } })
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Serialize the entries for storage.
     * @param book book to encode.
     * @returns the JSON array text.
     */
    fun encode(book: ServerBook): String {
        val array = JSONArray()
        for (entry in book.servers) {
            array.put(JSONObject().apply {
                put("id", entry.id)
                put("label", entry.label)
                put("url", entry.url)
                entry.certAlias?.let { put("certAlias", it) }
            })
        }
        return array.toString()
    }

    /** Preference key holding the encoded entries. */
    fun serversKey(): String = KEY_SERVERS

    /** Preference key holding the active server id. */
    fun activeKey(): String = KEY_ACTIVE
}
