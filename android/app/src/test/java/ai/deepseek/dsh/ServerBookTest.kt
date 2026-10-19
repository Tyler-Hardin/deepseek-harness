package ai.deepseek.dsh

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The server book's invariants: unique URLs, stable ids, and migration. */
class ServerBookTest {

    private fun book(vararg entries: ServerEntry, active: String? = entries.firstOrNull()?.id) =
        ServerBook(entries.toList(), active)

    @Test
    fun `adding a server normalizes its url and selects the first one`() {
        val edited = ServerEdits.add(ServerBook(emptyList(), null), "a", "home", "home.example:3080/")
        val applied = edited as ServerEdit.Applied
        assertEquals("https://home.example:3080", applied.book.servers.single().url)
        assertEquals("a", applied.book.activeId)
    }

    @Test
    fun `adding refuses an invalid url and a duplicate`() {
        val empty = ServerBook(emptyList(), null)
        assertEquals(ServerEdit.Rejected(ServerRejection.INVALID_URL), ServerEdits.add(empty, "a", "", "ftp://nope"))
        val one = (ServerEdits.add(empty, "a", "", "https://home.example") as ServerEdit.Applied).book
        assertEquals(ServerEdit.Rejected(ServerRejection.DUPLICATE_URL), ServerEdits.add(one, "b", "work", "https://home.example/"))
    }

    @Test
    fun `editing keeps the id and refuses another entry's url`() {
        val one = (ServerEdits.add(ServerBook(emptyList(), null), "a", "home", "https://home.example") as ServerEdit.Applied).book
        val two = (ServerEdits.add(one, "b", "work", "https://work.example") as ServerEdit.Applied).book
        val renamed = ServerEdits.update(two, "b", "office", "https://office.example") as ServerEdit.Applied
        assertEquals("b", renamed.book.servers.first { it.label == "office" }.id)
        assertEquals(
            ServerEdit.Rejected(ServerRejection.DUPLICATE_URL),
            ServerEdits.update(renamed.book, "b", "office", "https://home.example"),
        )
    }

    @Test
    fun `removing the active server leaves no active selection`() {
        val one = (ServerEdits.add(ServerBook(emptyList(), null), "a", "home", "https://home.example") as ServerEdit.Applied).book
        val two = (ServerEdits.add(one, "b", "work", "https://work.example") as ServerEdit.Applied).book
        val removed = ServerEdits.remove(two, "a") as ServerEdit.Applied
        assertNull(removed.book.activeId)
        assertEquals(listOf("b"), removed.book.servers.map { it.id })
    }

    @Test
    fun `selecting an unknown server is refused`() {
        assertEquals(ServerEdit.Rejected(ServerRejection.EMPTY_BOOK), ServerEdits.select(ServerBook(emptyList(), null), "nope"))
    }

    @Test
    fun `the certificate alias belongs to the active server`() {
        val one = (ServerEdits.add(ServerBook(emptyList(), null), "a", "home", "https://home.example") as ServerEdit.Applied).book
        val two = (ServerEdits.add(one, "b", "work", "https://work.example") as ServerEdit.Applied).book
        val selected = (ServerEdits.select(two, "b") as ServerEdit.Applied).book
        val withCert = ServerEdits.setCertAlias(selected, "work-cert")
        assertEquals("work-cert", withCert.byId("b")?.certAlias)
        assertNull(withCert.byId("a")?.certAlias)
    }

    @Test
    fun `migration keeps the legacy url and certificate and leaves the label empty`() {
        val migrated = ServerMigration.fromLegacy("https://home.example", "home-cert", "m")
        val entry = migrated.servers.single()
        assertEquals("https://home.example", entry.url)
        assertEquals("home-cert", entry.certAlias)
        assertEquals("", entry.label)
        assertEquals("m", migrated.activeId)
    }

    @Test
    fun `migration of an unusable legacy url produces an empty book`() {
        assertTrue(ServerMigration.fromLegacy("", null, "m").servers.isEmpty())
        assertNull(ServerMigration.fromLegacy("nonsense", null, "m").activeId)
    }

    @Test
    fun `codec round-trips the book and ignores a corrupt payload`() {
        val one = (ServerEdits.add(ServerBook(emptyList(), null), "a", "home", "https://home.example") as ServerEdit.Applied).book
        val withCert = ServerEdits.setCertAlias(one, "home-cert")
        val decoded = ServerBookCodec.decode(ServerBookCodec.encode(withCert), withCert.activeId)
        assertEquals(withCert, decoded)
        assertNull(ServerBookCodec.decode("{not json", "a"))
        assertNull(ServerBookCodec.decode(null, null))
    }

    @Test
    fun `decoding drops an active id that is not in the book`() {
        val one = (ServerEdits.add(ServerBook(emptyList(), null), "a", "home", "https://home.example") as ServerEdit.Applied).book
        assertNull(ServerBookCodec.decode(ServerBookCodec.encode(one), "gone")?.activeId)
    }
}
